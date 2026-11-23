package main

import (
	"archive/tar"
	"bytes"
	"encoding/hex"
	"fmt"
	"golang.org/x/crypto/scrypt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func verifierFor(code string) string {
	salt := []byte("0123456789abcdef")
	key, _ := scrypt.Key([]byte(code), salt, 1024, 8, 1, 32)
	return fmt.Sprintf("scrypt$1024$8$1$%s$%s", hex.EncodeToString(salt), hex.EncodeToString(key))
}

func TestLoadConfigReadsFile(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "c.json")
	_ = os.WriteFile(f, []byte(`{"title":"T","healthLabel":"H","access":{"name":"viewer","verifier":"x"}}`), 0o644)
	t.Setenv("MAP_CONFIG", f)
	c := loadConfig()
	if c.title != "T" || c.healthLabel != "H" || !c.authRequired() {
		t.Fatalf("%+v", c)
	}
}

func fixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	must := func(err error) {
		if err != nil {
			t.Fatal(err)
		}
	}
	must(os.MkdirAll(filepath.Join(root, "maps", "world"), 0o755))
	must(os.WriteFile(filepath.Join(root, "index.html"), []byte("<html>viewer</html>"), 0o644))
	must(os.WriteFile(filepath.Join(root, "maps", "world", "0.prbm.gz"), []byte("gzbytes"), 0o644))
	return root
}

func get(h http.Handler, p, user, code string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, p, nil)
	if user != "" {
		req.SetBasicAuth(user, code)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestServesFilesAndPrecompressedTiles(t *testing.T) {
	c := config{root: fixture(t)}
	if rec := get(c.handler(), "/", "", ""); rec.Code != 200 || !bytes.Contains(rec.Body.Bytes(), []byte("viewer")) {
		t.Fatalf("index: %d", rec.Code)
	}
	raw := get(c.handler(), "/maps/world/0.prbm.gz", "", "")
	if raw.Code != 200 || raw.Header().Get("Content-Encoding") != "" || raw.Body.String() != "gzbytes" {
		t.Fatalf("raw .gz: %d %v", raw.Code, raw.Header())
	}
	plain := get(c.handler(), "/maps/world/0.prbm", "", "")
	if plain.Code != 200 || plain.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("plain asked, .gz held: %d %v", plain.Code, plain.Header())
	}
}

func TestHealthNeedsNoCodeAndReportsMaps(t *testing.T) {
	c := config{root: fixture(t), name: "viewer", verifier: verifierFor("code")}
	rec := get(c.handler(), "/health", "", "")
	if rec.Code != 200 || !bytes.Contains(rec.Body.Bytes(), []byte(`"maps":1`)) {
		t.Fatalf("health: %d %s", rec.Code, rec.Body.String())
	}
}

func TestHealthIsUnavailableWhenEmpty(t *testing.T) {
	c := config{root: t.TempDir()}
	if rec := get(c.handler(), "/health", "", ""); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("empty root should not report healthy: %d", rec.Code)
	}
}

func TestAccessCode(t *testing.T) {
	c := config{root: fixture(t), name: "viewer", verifier: verifierFor("right-code")}
	h := c.handler()
	if get(h, "/", "", "").Code != 401 {
		t.Fatal("no credentials should be refused")
	}
	if get(h, "/", "viewer", "wrong").Code != 401 {
		t.Fatal("wrong code should be refused")
	}
	if get(h, "/", "someone", "right-code").Code != 401 {
		t.Fatal("wrong name should be refused")
	}
	if get(h, "/", "viewer", "right-code").Code != 200 {
		t.Fatal("right credentials should pass")
	}
}

func TestResolveStaysUnderRoot(t *testing.T) {
	root := t.TempDir()
	full, ok := resolve(root, "/../../etc/passwd")
	if !ok {
		return
	}
	if rel, _ := filepath.Rel(root, full); rel == ".." || len(rel) > 1 && rel[:2] == ".." {
		t.Fatalf("escaped the root: %s", full)
	}
}

func TestExtractRefusesSymlinksAndPinsTraversal(t *testing.T) {
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	_ = tw.WriteHeader(&tar.Header{Name: "link", Typeflag: tar.TypeSymlink, Linkname: "/etc"})
	_ = tw.Close()
	if err := extractTar(&buf, t.TempDir()); err == nil {
		t.Fatal("symlink should be refused")
	}
	var ok bytes.Buffer
	tw = tar.NewWriter(&ok)
	_ = tw.WriteHeader(&tar.Header{Name: "../../evil.txt", Typeflag: tar.TypeReg, Size: 1, Mode: 0o644})
	_, _ = tw.Write([]byte("x"))
	_ = tw.Close()
	dest := t.TempDir()
	if err := extractTar(&ok, dest); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dest, "evil.txt")); err != nil {
		t.Fatal("a traversal name should be pinned under the destination")
	}
}
