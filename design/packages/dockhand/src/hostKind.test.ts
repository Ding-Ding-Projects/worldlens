import { describe, expect, it } from "vitest";
import {
    REFUSED_ROOTS,
    detectHostKind,
    loopbackProbeCommand,
    stagingPathRefusal,
} from "./hostKind.js";
import { output } from "./fakes.js";

const answering = (stdout: string, ok = true) =>
    async () => await Promise.resolve(output({ ok, stdout, exitCode: ok ? 0 : 1 }));

describe("asking a machine what it is", () => {
    it("reads a POSIX answer", async () => {
        await expect(detectHostKind(answering("Linux\n"), "ssh", [])).resolves.toBe("posix");
        await expect(detectHostKind(answering("Darwin\n"), "ssh", [])).resolves.toBe("posix");
    });

    it("treats a failed uname as Windows, because that is what its absence means", async () => {
        // Probing the other way round would mean starting PowerShell on every POSIX host to
        // be told it is not there.
        await expect(detectHostKind(answering("", false), "ssh", [])).resolves.toBe("windows");
    });

    it("treats an answer it does not recognise as Windows rather than guessing POSIX", async () => {
        // Guessing POSIX would send an unquotable command to a shell that cannot parse it.
        await expect(detectHostKind(answering("'uname' is not recognized"), "ssh", [])).resolves.toBe(
            "windows",
        );
    });
});

describe("checking a port is really listening", () => {
    it("uses a bash builtin on POSIX, so nothing has to be installed", () => {
        const command = loopbackProbeCommand("posix", 8100);

        expect(command).toContain("/dev/tcp/127.0.0.1/8100");
        expect(command).toContain("timeout 5");
    });

    it("uses an encoded PowerShell command on Windows, so no shell has to parse it", () => {
        // The whole point: there is no /dev/tcp on Windows and usually no bash, so the POSIX
        // probe would report "not listening" for a service that started perfectly, and the
        // deployment would roll back a container that worked.
        const command = loopbackProbeCommand("windows", 8100);

        expect(command).toContain("-EncodedCommand");
        expect(command).not.toContain("/dev/tcp");
    });

    it("sends nothing a login shell could reinterpret", () => {
        // A Windows host's login shell may be cmd.exe or PowerShell and they disagree about
        // quoting, so the command line has to contain no character either would touch.
        const command = loopbackProbeCommand("windows", 8100);
        const encoded = command.split(" ").at(-1) ?? "";

        expect(encoded).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it("really encodes the port it was given", () => {
        const encoded = loopbackProbeCommand("windows", 9999).split(" ").at(-1) ?? "";
        const decoded = Buffer.from(encoded, "base64").toString("utf16le");

        expect(decoded).toContain("9999");
        expect(decoded).toContain("TcpClient");
    });
});

describe("refusing to stage somewhere dangerous", () => {
    it("refuses POSIX system directories", () => {
        for (const root of REFUSED_ROOTS.posix)
            expect(stagingPathRefusal("posix", `${root}/worldlens`)).not.toBeNull();
    });

    it("allows an ordinary POSIX home directory, which is where a deployment belongs", () => {
        // A list that refused this would be one people work around rather than one they trust.
        expect(stagingPathRefusal("posix", "/home/deploy/apps")).toBeNull();
        expect(stagingPathRefusal("posix", "~/apps")).toBeNull();
    });

    it("refuses a POSIX path that is not absolute", () => {
        expect(stagingPathRefusal("posix", "apps/thing")).not.toBeNull();
    });

    it("refuses the filesystem root itself", () => {
        expect(stagingPathRefusal("posix", "/")).not.toBeNull();
    });

    it("refuses Windows system directories, which the POSIX list says nothing about", () => {
        // The gap this closes: a refusal list for the wrong platform is not a weaker guard,
        // it is an absent one. Every one of these passes the POSIX list untouched.
        for (const path of [
            "C:\\Windows\\System32",
            "C:\\Program Files\\Thing",
            "C:\\ProgramData\\Thing",
            "c:/windows/temp",
        ])
            expect(stagingPathRefusal("windows", path), `${path} should be refused`).not.toBeNull();
    });

    it("refuses a bare drive or share root, which is a machine rather than a directory", () => {
        expect(stagingPathRefusal("windows", "C:\\")).not.toBeNull();
        expect(stagingPathRefusal("windows", "C:")).not.toBeNull();
        expect(stagingPathRefusal("windows", "\\\\server\\share")).not.toBeNull();
    });

    it("allows an ordinary Windows directory", () => {
        expect(stagingPathRefusal("windows", "C:\\deploy\\apps")).toBeNull();
        expect(stagingPathRefusal("windows", "D:/apps/thing")).toBeNull();
        expect(stagingPathRefusal("windows", "\\\\server\\share\\apps")).toBeNull();
    });

    it("refuses a Windows path that is not absolute", () => {
        expect(stagingPathRefusal("windows", "apps\\thing")).not.toBeNull();
    });

    it("refuses a path with a NUL byte on either platform", () => {
        expect(stagingPathRefusal("posix", "/home/deploy\0/../etc")).not.toBeNull();
        expect(stagingPathRefusal("windows", "C:\\deploy\0")).not.toBeNull();
    });

    it("is not case-sensitive on Windows, where the filesystem is not either", () => {
        expect(stagingPathRefusal("windows", "c:\\WINDOWS\\system32")).not.toBeNull();
    });
});
