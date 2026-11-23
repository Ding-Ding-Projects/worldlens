package main

import (
	"archive/tar"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

const (
	maxFileBytes  = 4 << 30
	maxTotalBytes = 40 << 30
	maxEntries    = 1_000_000
)

// extractTar unpacks a tar stream into dest. It accepts regular files and directories
// only: a symlink, a device or a hard link in a map is refused rather than followed, and
// every entry name is cleaned under dest so none can name a path outside it.
func extractTar(r io.Reader, dest string) error {
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}
	tr := tar.NewReader(r)
	var total int64
	for n := 0; ; n++ {
		if n > maxEntries {
			return errors.New("too many entries")
		}
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		name := path.Clean("/" + strings.ReplaceAll(hdr.Name, "\\", "/"))
		if name == "/" {
			continue
		}
		target := filepath.Join(dest, filepath.FromSlash(name))
		rel, err := filepath.Rel(dest, target)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return fmt.Errorf("unsafe path %q", hdr.Name)
		}
		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if hdr.Size > maxFileBytes {
				return fmt.Errorf("%q is too large", hdr.Name)
			}
			total += hdr.Size
			if total > maxTotalBytes {
				return errors.New("archive is too large")
			}
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			f, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
			if err != nil {
				return err
			}
			if _, err := io.Copy(f, io.LimitReader(tr, hdr.Size)); err != nil {
				f.Close()
				return err
			}
			if err := f.Close(); err != nil {
				return err
			}
		default:
			return fmt.Errorf("%q is not a regular file or folder", hdr.Name)
		}
	}
}
