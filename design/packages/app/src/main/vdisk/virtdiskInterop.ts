/**
 * The VirtDisk API route. Windows ships `virtdisk.dll` on every edition, including Home, so this
 * route needs no Hyper-V. PowerShell loads a small C# shim with `Add-Type` and calls the API
 * directly; each call prints one JSON object on stdout, which the manager parses.
 *
 * Structures are packed by hand into byte buffers at the offsets `virtdisk.h` gives on 64-bit
 * Windows, so no structure layout depends on the marshaller. Every function returns a Win32 error
 * code that is surfaced as-is; nothing is retried or guessed.
 */

export const VIRTDISK_CS = String.raw`
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace Worldlens {
public static class VirtDisk {
    const string Dll = "virtdisk.dll";
    static readonly Guid MicrosoftVendor = new Guid("EC984AEC-A0F9-47e9-901F-71415A66345B");

    [DllImport(Dll, CharSet = CharSet.Unicode)] static extern int OpenVirtualDisk(byte[] storageType, string path, int accessMask, int flags, byte[] parameters, out SafeFileHandle handle);
    [DllImport(Dll, CharSet = CharSet.Unicode)] static extern int CreateVirtualDisk(byte[] storageType, string path, int accessMask, IntPtr securityDescriptor, int flags, int providerFlags, IntPtr parameters, IntPtr overlapped, out SafeFileHandle handle);
    [DllImport(Dll)] static extern int GetVirtualDiskInformation(SafeFileHandle handle, ref int size, IntPtr info, out int used);
    [DllImport(Dll)] static extern int SetVirtualDiskInformation(SafeFileHandle handle, IntPtr info);
    [DllImport(Dll)] static extern int ResizeVirtualDisk(SafeFileHandle handle, int flags, byte[] parameters, IntPtr overlapped);
    [DllImport(Dll)] static extern int CompactVirtualDisk(SafeFileHandle handle, int flags, byte[] parameters, IntPtr overlapped);
    [DllImport(Dll)] static extern int MergeVirtualDisk(SafeFileHandle handle, int flags, byte[] parameters, IntPtr overlapped);
    [DllImport(Dll)] static extern int MirrorVirtualDisk(SafeFileHandle handle, int flags, IntPtr parameters, ref NativeOverlapped overlapped);
    [DllImport(Dll)] static extern int BreakMirrorVirtualDisk(SafeFileHandle handle);
    [DllImport(Dll)] static extern int AttachVirtualDisk(SafeFileHandle handle, IntPtr securityDescriptor, int flags, int providerFlags, byte[] parameters, IntPtr overlapped);
    [DllImport(Dll)] static extern int DetachVirtualDisk(SafeFileHandle handle, int flags, int providerFlags);
    [DllImport(Dll)] static extern int GetVirtualDiskOperationProgress(SafeFileHandle handle, ref NativeOverlapped overlapped, byte[] progress);
    [DllImport(Dll)] static extern int EnumerateVirtualDiskMetadata(SafeFileHandle handle, ref int count, [Out] Guid[] items);
    [DllImport(Dll)] static extern int GetVirtualDiskMetadata(SafeFileHandle handle, ref Guid item, ref int size, byte[] data);
    [DllImport(Dll)] static extern int SetVirtualDiskMetadata(SafeFileHandle handle, ref Guid item, int size, byte[] data);
    [DllImport(Dll)] static extern int DeleteVirtualDiskMetadata(SafeFileHandle handle, ref Guid item);
    [DllImport(Dll, CharSet = CharSet.Unicode)] static extern int QueryChangesVirtualDisk(SafeFileHandle handle, string changeTrackingId, ulong offset, ulong length, int flags, byte[] ranges, ref int rangeCount, out ulong processed);
    [DllImport(Dll)] static extern int TakeSnapshotVhdSet(SafeFileHandle handle, byte[] parameters, int flags);
    [DllImport(Dll)] static extern int ApplySnapshotVhdSet(SafeFileHandle handle, byte[] parameters, int flags);
    [DllImport(Dll)] static extern int DeleteSnapshotVhdSet(SafeFileHandle handle, byte[] parameters, int flags);

    const int ACCESS_NONE = 0, ACCESS_ALL = 0x003f0000, ACCESS_GET_INFO = 0x00080000, ACCESS_METAOPS = 0x00200000;

    static void Check(int code, string what) {
        if (code != 0) throw new Win32Exception(code, what + " failed: " + new Win32Exception(code).Message + " (" + code + ")");
    }

    static byte[] UnknownType() { return new byte[20]; }

    static byte[] TypeFor(string path) {
        var b = new byte[20];
        string p = path.ToLowerInvariant();
        int device = p.EndsWith(".vhds") ? 4 : (p.EndsWith(".vhdx") || p.EndsWith(".avhdx")) ? 3 : p.EndsWith(".iso") ? 1 : 2;
        BitConverter.GetBytes(device).CopyTo(b, 0);
        MicrosoftVendor.ToByteArray().CopyTo(b, 4);
        return b;
    }

    /** OPEN_VIRTUAL_DISK_PARAMETERS version 1 (RWDepth) or 2 (GetInfoOnly, ReadOnly). */
    static byte[] OpenParams(int version, int rwDepth, bool infoOnly, bool readOnly) {
        var b = new byte[28];
        BitConverter.GetBytes(version).CopyTo(b, 0);
        if (version == 1) BitConverter.GetBytes(rwDepth).CopyTo(b, 4);
        else { BitConverter.GetBytes(infoOnly ? 1 : 0).CopyTo(b, 4); BitConverter.GetBytes(readOnly ? 1 : 0).CopyTo(b, 8); }
        return b;
    }

    static SafeFileHandle Open(string path, bool infoOnly) {
        SafeFileHandle h;
        Check(OpenVirtualDisk(UnknownType(), path, ACCESS_NONE, 0, OpenParams(2, 0, infoOnly, false), out h), "OpenVirtualDisk");
        return h;
    }

    static SafeFileHandle OpenV1(string path, int access, int depth) {
        SafeFileHandle h;
        Check(OpenVirtualDisk(UnknownType(), path, access, 0, OpenParams(1, depth, false, false), out h), "OpenVirtualDisk");
        return h;
    }

    static byte[] Info(SafeFileHandle h, int version, bool optional) {
        int size = 4096;
        IntPtr buf = Marshal.AllocHGlobal(size);
        try {
            for (int i = 0; i < size; i++) Marshal.WriteByte(buf, i, 0);
            Marshal.WriteInt32(buf, 0, version);
            int used;
            int code = GetVirtualDiskInformation(h, ref size, buf, out used);
            if (code != 0) { if (optional) return null; Check(code, "GetVirtualDiskInformation " + version); }
            var outb = new byte[size];
            Marshal.Copy(buf, outb, 0, size);
            return outb;
        } finally { Marshal.FreeHGlobal(buf); }
    }

    static string MultiSz(byte[] b, int offset) {
        var parts = new List<string>();
        int i = offset;
        while (i + 1 < b.Length) {
            int start = i;
            while (i + 1 < b.Length && (b[i] != 0 || b[i + 1] != 0)) i += 2;
            if (i == start) break;
            parts.Add(Encoding.Unicode.GetString(b, start, i - start));
            i += 2;
        }
        return string.Join("|", parts.ToArray());
    }

    static string Json(Dictionary<string, object> d) {
        var sb = new StringBuilder("{");
        bool first = true;
        foreach (var kv in d) {
            if (!first) sb.Append(",");
            first = false;
            sb.Append("\"").Append(kv.Key).Append("\":");
            object v = kv.Value;
            if (v == null) sb.Append("null");
            else if (v is bool) sb.Append(((bool)v) ? "true" : "false");
            else if (v is int || v is long || v is ulong || v is uint) sb.Append(Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture));
            else if (v is string[]) {
                sb.Append("[");
                var arr = (string[])v;
                for (int i = 0; i < arr.Length; i++) { if (i > 0) sb.Append(","); sb.Append(Quote(arr[i])); }
                sb.Append("]");
            }
            else sb.Append(Quote(v.ToString()));
        }
        return sb.Append("}").ToString();
    }

    static string Quote(string s) {
        var sb = new StringBuilder("\"");
        foreach (char c in s) {
            if (c == '"' || c == '\\') sb.Append('\\').Append(c);
            else if (c < 32) sb.Append("\\u").Append(((int)c).ToString("x4"));
            else sb.Append(c);
        }
        return sb.Append("\"").ToString();
    }

    static string Ok(Dictionary<string, object> d) { d["ok"] = true; return Json(d); }

    /** Everything the library shows about a disk, in one read-only open. */
    public static string Describe(string path) {
        using (var h = Open(path, true)) {
            var d = new Dictionary<string, object>();
            var size = Info(h, 1, false);
            d["virtualSize"] = BitConverter.ToUInt64(size, 8);
            d["physicalSize"] = BitConverter.ToUInt64(size, 16);
            d["blockSize"] = BitConverter.ToUInt32(size, 24);
            d["sectorSize"] = BitConverter.ToUInt32(size, 28);
            d["identifier"] = new Guid(Slice(Info(h, 2, false), 8, 16)).ToString();
            var subtype = Info(h, 7, true);
            int st = subtype == null ? 0 : BitConverter.ToInt32(subtype, 8);
            d["type"] = st == 2 ? "fixed" : st == 3 ? "dynamic" : st == 4 ? "differencing" : "unknown";
            var parent = st == 4 ? Info(h, 3, true) : null;
            d["parentResolved"] = parent != null && BitConverter.ToInt32(parent, 8) != 0;
            d["parentPaths"] = parent == null ? new string[0] : MultiSz(parent, 12).Split(new[] { '|' }, StringSplitOptions.RemoveEmptyEntries);
            var aligned = Info(h, 8, true);
            d["is4kAligned"] = aligned != null && BitConverter.ToInt32(aligned, 8) != 0;
            var phys = Info(h, 10, true);
            d["physicalSectorSize"] = phys == null ? (object)null : BitConverter.ToUInt32(phys, 8);
            var smallest = Info(h, 11, true);
            d["smallestSafeSize"] = smallest == null ? (object)null : BitConverter.ToUInt64(smallest, 8);
            var frag = Info(h, 12, true);
            d["fragmentationPercent"] = frag == null ? (object)null : BitConverter.ToUInt32(frag, 8);
            var loaded = Info(h, 13, true);
            d["isLoaded"] = loaded != null && BitConverter.ToInt32(loaded, 8) != 0;
            var vid = Info(h, 14, true);
            d["virtualDiskId"] = vid == null ? null : new Guid(Slice(vid, 8, 16)).ToString();
            var ct = Info(h, 15, true);
            d["changeTracking"] = ct != null && BitConverter.ToInt32(ct, 8) != 0;
            d["changeTrackingId"] = ct == null ? null : MultiSz(ct, 16);
            return Ok(d);
        }
    }

    static byte[] Slice(byte[] b, int offset, int count) { var o = new byte[count]; Array.Copy(b, offset, o, 0, count); return o; }

    /** Resizes a disk. newSize 0 with smallestSafe shrinks as far as it can without cutting a partition. */
    public static string Resize(string path, ulong newSize, bool smallestSafe) {
        using (var h = Open(path, false)) {
            var p = new byte[16];
            BitConverter.GetBytes(1).CopyTo(p, 0);
            BitConverter.GetBytes(smallestSafe ? 0UL : newSize).CopyTo(p, 8);
            Check(ResizeVirtualDisk(h, smallestSafe ? 0x2 : 0, p, IntPtr.Zero), "ResizeVirtualDisk");
        }
        return Describe(path);
    }

    /** Full (0) scans for zero blocks; Quick (1, NO_ZERO_SCAN) only reclaims what the file system freed. */
    public static string Compact(string path, bool quick) {
        using (var h = OpenV1(path, ACCESS_METAOPS, 1)) {
            var p = new byte[8];
            BitConverter.GetBytes(1).CopyTo(p, 0);
            Check(CompactVirtualDisk(h, quick ? 1 : 0, p, IntPtr.Zero), "CompactVirtualDisk");
        }
        return Describe(path);
    }

    /** Merges a differencing disk into its parents, depth levels up. */
    public static string Merge(string childPath, int depth) {
        using (var h = OpenV1(childPath, ACCESS_METAOPS | ACCESS_GET_INFO, depth + 1)) {
            var p = new byte[8];
            BitConverter.GetBytes(1).CopyTo(p, 0);
            BitConverter.GetBytes(depth).CopyTo(p, 4);
            Check(MergeVirtualDisk(h, 0, p, IntPtr.Zero), "MergeVirtualDisk");
        }
        var d = new Dictionary<string, object>();
        d["merged"] = childPath;
        d["depth"] = depth;
        return Ok(d);
    }

    /**
     * Creates a disk with CREATE_VIRTUAL_DISK_PARAMETERS version 2. A source path makes it a
     * copy (conversion between VHD, VHDX and VHD Set); a parent path makes it differencing.
     */
    public static string Create(string path, ulong maximumSize, bool fixedSize, uint blockSize, uint logicalSector, uint physicalSector, string parentPath, string sourcePath) {
        IntPtr p = Marshal.AllocHGlobal(128);
        IntPtr parent = parentPath == null ? IntPtr.Zero : Marshal.StringToHGlobalUni(parentPath);
        IntPtr source = sourcePath == null ? IntPtr.Zero : Marshal.StringToHGlobalUni(sourcePath);
        try {
            for (int i = 0; i < 128; i++) Marshal.WriteByte(p, i, 0);
            Marshal.WriteInt32(p, 0, 2);
            Marshal.WriteInt64(p, 24, (long)maximumSize);
            Marshal.WriteInt32(p, 32, (int)blockSize);
            Marshal.WriteInt32(p, 36, (int)logicalSector);
            Marshal.WriteInt32(p, 40, (int)physicalSector);
            Marshal.WriteIntPtr(p, 48, parent);
            Marshal.WriteIntPtr(p, 56, source);
            SafeFileHandle h;
            bool vhdSet = path.ToLowerInvariant().EndsWith(".vhds");
            // A VHD Set is a small header file plus a backing disk Windows creates beside it;
            // CREATE_VIRTUAL_DISK_FLAG_CREATE_BACKING_STORAGE (0x8) asks for that backing disk.
            int flags = (fixedSize ? 1 : 0) | (vhdSet ? 8 : 0);
            int code = CreateVirtualDisk(TypeFor(path), path, ACCESS_NONE, IntPtr.Zero, flags, 0, p, IntPtr.Zero, out h);
            // A VHD Set refuses defaults on some builds; the documented VHD Set sector sizes are
            // 512 logical and 4096 physical. Retry once with them before reporting the error.
            if (code == 87 && vhdSet && logicalSector == 0 && physicalSector == 0) {
                Marshal.WriteInt32(p, 36, 512);
                Marshal.WriteInt32(p, 40, 4096);
                code = CreateVirtualDisk(TypeFor(path), path, ACCESS_NONE, IntPtr.Zero, flags, 0, p, IntPtr.Zero, out h);
            }
            Check(code, "CreateVirtualDisk");
            h.Dispose();
        } finally {
            Marshal.FreeHGlobal(p);
            if (parent != IntPtr.Zero) Marshal.FreeHGlobal(parent);
            if (source != IntPtr.Zero) Marshal.FreeHGlobal(source);
        }
        return Describe(path);
    }

    static void SetInfo(string path, int version, Action<IntPtr> fill) {
        using (var h = Open(path, false)) {
            IntPtr p = Marshal.AllocHGlobal(64);
            try {
                for (int i = 0; i < 64; i++) Marshal.WriteByte(p, i, 0);
                Marshal.WriteInt32(p, 0, version);
                fill(p);
                Check(SetVirtualDiskInformation(h, p), "SetVirtualDiskInformation " + version);
            } finally { Marshal.FreeHGlobal(p); }
        }
    }

    /** Gives the disk a new identifier, which resolves a collision between two copies. */
    public static string NewIdentifier(string path) {
        var id = Guid.NewGuid();
        SetInfo(path, 2, p => Marshal.Copy(id.ToByteArray(), 0, p + 8, 16));
        return Describe(path);
    }

    /** Points a differencing disk at a moved or replaced parent. */
    public static string SetParent(string childPath, string parentPath) {
        IntPtr s = Marshal.StringToHGlobalUni(parentPath);
        try { SetInfo(childPath, 1, p => Marshal.WriteIntPtr(p, 8, s)); }
        finally { Marshal.FreeHGlobal(s); }
        return Describe(childPath);
    }

    public static string SetPhysicalSectorSize(string path, uint bytes) {
        SetInfo(path, 4, p => Marshal.WriteInt32(p, 8, (int)bytes));
        return Describe(path);
    }

    public static string SetChangeTracking(string path, bool enabled) {
        SetInfo(path, 6, p => Marshal.WriteInt32(p, 8, enabled ? 1 : 0));
        return Describe(path);
    }

    /** Ranges changed since a change tracking id, as offset:length pairs. */
    public static string QueryChanges(string path, string changeTrackingId) {
        // Windows answers a change query only on a handle that may read the disk; on some builds
        // only while the disk is attached. Try a read-only open first, then a read-only attach
        // without a drive letter for the length of the query.
        int lastCode = 0;
        foreach (var attach in new[] { false, true }) {
            SafeFileHandle h;
            int code = attach ? OpenVirtualDisk(UnknownType(), path, ACCESS_ALL, 0, OpenParams(1, 1, false, false), out h)
                              : OpenVirtualDisk(UnknownType(), path, ACCESS_NONE, 0, OpenParams(2, 0, false, true), out h);
            if (code != 0) { lastCode = code; continue; }
            using (h) {
                bool attached = false;
                try {
                    if (attach) {
                        var ap = new byte[8];
                        BitConverter.GetBytes(1).CopyTo(ap, 0);
                        Check(AttachVirtualDisk(h, IntPtr.Zero, 1 | 2, 0, ap, IntPtr.Zero), "AttachVirtualDisk");
                        attached = true;
                    }
                    var ranges = QueryRanges(h, changeTrackingId, out code);
                    if (code == 0) {
                        var d = new Dictionary<string, object>();
                        d["ranges"] = ranges.ToArray();
                        d["attachedForQuery"] = attach;
                        return Ok(d);
                    }
                    lastCode = code;
                } finally {
                    if (attached) DetachVirtualDisk(h, 0, 0);
                }
            }
        }
        Check(lastCode, "QueryChangesVirtualDisk");
        return Ok(new Dictionary<string, object>());
    }

    static List<string> QueryRanges(SafeFileHandle h, string changeTrackingId, out int failure) {
        failure = 0;
        var ranges = new List<string>();
        var size = Info(h, 1, false);
        ulong virtualSize = BitConverter.ToUInt64(size, 8);
        ulong offset = 0;
        while (offset < virtualSize) {
            int count = 256;
            var buf = new byte[count * 24];
            ulong processed;
            int code = QueryChangesVirtualDisk(h, changeTrackingId, offset, virtualSize - offset, 0, buf, ref count, out processed);
            if (code != 0) { failure = code; return ranges; }
            for (int i = 0; i < count; i++) ranges.Add(BitConverter.ToUInt64(buf, i * 24) + ":" + BitConverter.ToUInt64(buf, i * 24 + 8));
            if (processed == 0) break;
            offset += processed;
        }
        return ranges;
    }

    public static string ListMetadata(string path) {
        using (var h = Open(path, true)) {
            int count = 0;
            int code = EnumerateVirtualDiskMetadata(h, ref count, null);
            if (code != 0 && code != 122 && code != 234) Check(code, "EnumerateVirtualDiskMetadata");
            var items = new Guid[count];
            if (count > 0) Check(EnumerateVirtualDiskMetadata(h, ref count, items), "EnumerateVirtualDiskMetadata");
            var outv = new List<string>();
            foreach (var g in items) {
                var key = g;
                int size = 0;
                GetVirtualDiskMetadata(h, ref key, ref size, null);
                var data = new byte[size];
                Check(GetVirtualDiskMetadata(h, ref key, ref size, data), "GetVirtualDiskMetadata");
                outv.Add(g.ToString() + "=" + Convert.ToBase64String(data, 0, size));
            }
            var d = new Dictionary<string, object>();
            d["items"] = outv.ToArray();
            return Ok(d);
        }
    }

    public static string SetMetadata(string path, string key, string base64Value) {
        var g = new Guid(key);
        var data = Convert.FromBase64String(base64Value);
        using (var h = Open(path, false)) Check(SetVirtualDiskMetadata(h, ref g, data.Length, data), "SetVirtualDiskMetadata");
        return ListMetadata(path);
    }

    public static string DeleteMetadata(string path, string key) {
        var g = new Guid(key);
        using (var h = Open(path, false)) Check(DeleteVirtualDiskMetadata(h, ref g), "DeleteVirtualDiskMetadata");
        return ListMetadata(path);
    }

    static byte[] SnapshotParams(Guid id, Guid leaf) {
        var b = new byte[36];
        BitConverter.GetBytes(1).CopyTo(b, 0);
        id.ToByteArray().CopyTo(b, 4);
        leaf.ToByteArray().CopyTo(b, 20);
        return b;
    }

    /** Takes a VHD Set checkpoint and returns its id. */
    public static string TakeCheckpoint(string vhdsPath) {
        var id = Guid.NewGuid();
        using (var h = Open(vhdsPath, false)) Check(TakeSnapshotVhdSet(h, SnapshotParams(id, Guid.Empty), 0), "TakeSnapshotVhdSet");
        var d = new Dictionary<string, object>();
        d["checkpointId"] = id.ToString();
        return Ok(d);
    }

    public static string ApplyCheckpoint(string vhdsPath, string checkpointId) {
        using (var h = Open(vhdsPath, false)) Check(ApplySnapshotVhdSet(h, SnapshotParams(new Guid(checkpointId), Guid.NewGuid()), 1), "ApplySnapshotVhdSet");
        var d = new Dictionary<string, object>();
        d["applied"] = checkpointId;
        return Ok(d);
    }

    public static string DeleteCheckpoint(string vhdsPath, string checkpointId) {
        using (var h = Open(vhdsPath, false)) Check(DeleteSnapshotVhdSet(h, SnapshotParams(new Guid(checkpointId), Guid.Empty), 0), "DeleteSnapshotVhdSet");
        var d = new Dictionary<string, object>();
        d["deleted"] = checkpointId;
        return Ok(d);
    }

    /**
     * Copies a disk to a new file while it stays usable, then breaks the mirror so the copy is
     * independent. Progress is polled until the copy completes.
     */
    public static string Mirror(string path, string destination) {
        // Mirroring is one of the version 2 operations: the handle comes from a version 2 open
        // with no access mask, the same as resize, which works on the same disk.
        using (var h = Open(path, false)) {
            IntPtr p = Marshal.AllocHGlobal(16);
            IntPtr dest = Marshal.StringToHGlobalUni(destination);
            var ev = new ManualResetEvent(false);
            var ov = new NativeOverlapped();
            ov.EventHandle = ev.SafeWaitHandle.DangerousGetHandle();
            bool attached = false;
            try {
                Marshal.WriteInt64(p, 0, 0);
                Marshal.WriteInt32(p, 0, 1);
                Marshal.WriteIntPtr(p, 8, dest);
                // Windows mirrors only a disk that is in use, so attach it without a drive letter
                // for the copy and detach afterwards. A disk that is already attached stays so.
                var ap = new byte[8];
                BitConverter.GetBytes(1).CopyTo(ap, 0);
                attached = AttachVirtualDisk(h, IntPtr.Zero, 2, 0, ap, IntPtr.Zero) == 0;
                int code = MirrorVirtualDisk(h, 0, p, ref ov);
                if (code != 0 && code != 997) Check(code, "MirrorVirtualDisk");
                var progress = new byte[24];
                for (int i = 0; i < 36000; i++) {
                    Check(GetVirtualDiskOperationProgress(h, ref ov, progress), "GetVirtualDiskOperationProgress");
                    int status = BitConverter.ToInt32(progress, 0);
                    ulong current = BitConverter.ToUInt64(progress, 8), done = BitConverter.ToUInt64(progress, 16);
                    if (status != 997 && status != 0) Check(status, "Mirror");
                    if (done > 0 && current >= done) break;
                    Thread.Sleep(100);
                }
                Check(BreakMirrorVirtualDisk(h), "BreakMirrorVirtualDisk");
            } finally {
                if (attached) DetachVirtualDisk(h, 0, 0);
                Marshal.FreeHGlobal(p);
                Marshal.FreeHGlobal(dest);
                ev.Dispose();
            }
        }
        return Describe(destination);
    }
}
}
`;

/** Single-quoted PowerShell string. */
export const psq = (value: string): string => `'${value.replace(/'/gu, "''")}'`;

export type VirtDiskCall =
    | { readonly op: "describe"; readonly path: string }
    | { readonly op: "resize"; readonly path: string; readonly newSizeBytes: number; readonly smallestSafe: boolean }
    | { readonly op: "compact"; readonly path: string; readonly quick: boolean }
    | { readonly op: "merge"; readonly path: string; readonly depth: number }
    | {
          readonly op: "create";
          readonly path: string;
          readonly maximumSizeBytes: number;
          readonly fixed: boolean;
          readonly blockSizeBytes?: number;
          readonly logicalSectorBytes?: number;
          readonly physicalSectorBytes?: number;
          readonly parentPath?: string;
          readonly sourcePath?: string;
      }
    | { readonly op: "newIdentifier"; readonly path: string }
    | { readonly op: "setParent"; readonly path: string; readonly parentPath: string }
    | { readonly op: "setPhysicalSectorSize"; readonly path: string; readonly bytes: 512 | 4096 }
    | { readonly op: "setChangeTracking"; readonly path: string; readonly enabled: boolean }
    | { readonly op: "queryChanges"; readonly path: string; readonly changeTrackingId: string }
    | { readonly op: "listMetadata"; readonly path: string }
    | { readonly op: "setMetadata"; readonly path: string; readonly key: string; readonly valueBase64: string }
    | { readonly op: "deleteMetadata"; readonly path: string; readonly key: string }
    | { readonly op: "takeCheckpoint"; readonly path: string }
    | { readonly op: "applyCheckpoint"; readonly path: string; readonly checkpointId: string }
    | { readonly op: "deleteCheckpoint"; readonly path: string; readonly checkpointId: string }
    | { readonly op: "mirror"; readonly path: string; readonly destination: string };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** The C# call for one operation, with every argument quoted or range-checked first. */
export function virtdiskInvocation(call: VirtDiskCall): string {
    const n = (value: number, what: string): string => {
        if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) throw new Error(`${what} must be a whole number of bytes.`);
        return `${value}`;
    };
    const g = (value: string): string => {
        if (!GUID.test(value)) throw new Error("A key or checkpoint id is a GUID such as 6c1e41b2-9a0f-4d7e-8c11-5b0a2f9e77d3.");
        return psq(value);
    };
    const T = "[Worldlens.VirtDisk]";
    switch (call.op) {
        case "describe":
            return `${T}::Describe(${psq(call.path)})`;
        case "resize":
            return `${T}::Resize(${psq(call.path)}, [uint64]${n(call.newSizeBytes, "The new size")}, $${call.smallestSafe})`;
        case "compact":
            return `${T}::Compact(${psq(call.path)}, $${call.quick})`;
        case "merge":
            return `${T}::Merge(${psq(call.path)}, ${Math.max(1, Math.floor(call.depth))})`;
        case "create":
            return `${T}::Create(${psq(call.path)}, [uint64]${n(call.maximumSizeBytes, "The size")}, $${call.fixed}, [uint32]${n(call.blockSizeBytes ?? 0, "The block size")}, [uint32]${n(call.logicalSectorBytes ?? 0, "The sector size")}, [uint32]${n(call.physicalSectorBytes ?? 0, "The sector size")}, ${call.parentPath ? psq(call.parentPath) : "$null"}, ${call.sourcePath ? psq(call.sourcePath) : "$null"})`;
        case "newIdentifier":
            return `${T}::NewIdentifier(${psq(call.path)})`;
        case "setParent":
            return `${T}::SetParent(${psq(call.path)}, ${psq(call.parentPath)})`;
        case "setPhysicalSectorSize":
            if (call.bytes !== 512 && call.bytes !== 4096) throw new Error("Sector sizes are 512 or 4096 bytes.");
            return `${T}::SetPhysicalSectorSize(${psq(call.path)}, [uint32]${call.bytes})`;
        case "setChangeTracking":
            return `${T}::SetChangeTracking(${psq(call.path)}, $${call.enabled})`;
        case "queryChanges":
            return `${T}::QueryChanges(${psq(call.path)}, ${psq(call.changeTrackingId)})`;
        case "listMetadata":
            return `${T}::ListMetadata(${psq(call.path)})`;
        case "setMetadata":
            if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(call.valueBase64)) throw new Error("Metadata values are passed as Base64.");
            return `${T}::SetMetadata(${psq(call.path)}, ${g(call.key)}, ${psq(call.valueBase64)})`;
        case "deleteMetadata":
            return `${T}::DeleteMetadata(${psq(call.path)}, ${g(call.key)})`;
        case "takeCheckpoint":
            return `${T}::TakeCheckpoint(${psq(call.path)})`;
        case "applyCheckpoint":
            return `${T}::ApplyCheckpoint(${psq(call.path)}, ${g(call.checkpointId)})`;
        case "deleteCheckpoint":
            return `${T}::DeleteCheckpoint(${psq(call.path)}, ${g(call.checkpointId)})`;
        case "mirror":
            return `${T}::Mirror(${psq(call.path)}, ${psq(call.destination)})`;
    }
}

/**
 * A complete PowerShell script for one VirtDisk call. It prints exactly one JSON line: the
 * result, or `{"ok":false,"code":<win32>,"message":...}` when the API refuses.
 */
export function virtdiskScript(call: VirtDiskCall): string {
    return [
        "$ErrorActionPreference = 'Stop'",
        "if (-not ('Worldlens.VirtDisk' -as [type])) { Add-Type -TypeDefinition @'",
        VIRTDISK_CS.trim(),
        "'@ }",
        "try {",
        `  Write-Output (${virtdiskInvocation(call)})`,
        "} catch {",
        "  $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }",
        "  $code = if ($e -is [System.ComponentModel.Win32Exception]) { $e.NativeErrorCode } else { 0 }",
        "  $msg = $e.Message.Replace('\\', '\\\\').Replace('\"', '\\\"').Replace([string][char]13, ' ').Replace([string][char]10, ' ')",
        "  Write-Output ('{\"ok\":false,\"code\":' + $code + ',\"message\":\"' + $msg + '\"}')",
        "}",
    ].join("\n");
}

/** The last JSON object a VirtDisk script printed, or a failure describing the raw output. */
export function parseVirtdiskOutput(output: string): { readonly ok: boolean; readonly [key: string]: unknown } {
    const lines = output.split(/\r?\n/u).map((l) => l.trim()).filter((l) => l.startsWith("{") && l.endsWith("}"));
    const last = lines.at(-1);
    if (!last) return { ok: false, message: output.trim().slice(-400) || "The VirtDisk call printed nothing." };
    try {
        return JSON.parse(last) as { ok: boolean };
    } catch {
        return { ok: false, message: last.slice(0, 400) };
    }
}
