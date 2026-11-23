// Command mapserver serves a rendered BlueMap web root as plain files.
//
// It has three jobs and no others:
//
//  1. Serve /data/map, including BlueMap's precompressed tiles. The viewer asks either for
//     `x.prbm.gz` (clientDecompression on) or for `x.prbm` (off); both work here.
//  2. Answer /health with a small JSON document, without asking for the access code.
//  3. Optionally require HTTP Basic access. Only a salted verifier is ever configured,
//     never the code itself.
//
// `mapserver --extract-tar <dir>` reads a tar from standard input into <dir> and exits. It
// exists so the volume can be filled by this same image, with no second tool inside it and
// no bind mount of a path from the machine that sent the map.
package main

import (
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"golang.org/x/crypto/scrypt"
	"html"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

var version = "dev"

const (
	defaultRoot   = "/data/map"
	defaultConfig = "/data/worldlens-map.json"
	defaultAddr   = ":8080"
)

// config is read once from the JSON file the app packs beside the map. Text fields are display
// labels already passed through the app's personal wording table; access holds only a salted
// scrypt verifier, never the code.
type config struct {
	root        string
	addr        string
	title       string
	healthLabel string
	name        string // viewer name; empty means no access code is required
	verifier    string // scrypt$N$r$p$saltHex$hashHex
}

type configFile struct {
	Title       string `json:"title"`
	HealthLabel string `json:"healthLabel"`
	Access      *struct {
		Name     string `json:"name"`
		Verifier string `json:"verifier"`
	} `json:"access"`
}

func loadConfig() config {
	get := func(key, fallback string) string {
		if v := os.Getenv(key); v != "" {
			return v
		}
		return fallback
	}
	c := config{root: get("MAP_ROOT", defaultRoot), addr: get("MAP_ADDR", defaultAddr), title: "Map", healthLabel: "Map server"}
	raw, err := os.ReadFile(get("MAP_CONFIG", defaultConfig))
	if err != nil {
		return c
	}
	var f configFile
	if json.Unmarshal(raw, &f) != nil {
		return c
	}
	if f.Title != "" {
		c.title = f.Title
	}
	if f.HealthLabel != "" {
		c.healthLabel = f.HealthLabel
	}
	if f.Access != nil {
		c.name, c.verifier = f.Access.Name, f.Access.Verifier
	}
	return c
}

func (c config) authRequired() bool { return c.name != "" && c.verifier != "" }

// checkCode verifies a code against `scrypt$N$r$p$saltHex$hashHex` in constant time.
func checkCode(verifier, code string) bool {
	parts := strings.Split(verifier, "$")
	if len(parts) != 6 || parts[0] != "scrypt" {
		return false
	}
	n, e1 := strconv.Atoi(parts[1])
	r, e2 := strconv.Atoi(parts[2])
	p, e3 := strconv.Atoi(parts[3])
	salt, e4 := hex.DecodeString(parts[4])
	want, e5 := hex.DecodeString(parts[5])
	if e1 != nil || e2 != nil || e3 != nil || e4 != nil || e5 != nil || n > 1<<20 || len(want) == 0 {
		return false
	}
	got, err := scrypt.Key([]byte(code), salt, n, r, p, len(want))
	return err == nil && subtle.ConstantTimeCompare(got, want) == 1
}

func (c config) allowed(r *http.Request) bool {
	if !c.authRequired() {
		return true
	}
	user, code, ok := r.BasicAuth()
	if !ok {
		return false
	}
	nameOK := subtle.ConstantTimeCompare([]byte(user), []byte(c.name)) == 1
	return checkCode(c.verifier, code) && nameOK
}

type healthBody struct {
	Status    string `json:"status"`
	Label     string `json:"label"`
	Title     string `json:"title"`
	Version   string `json:"version"`
	Maps      int    `json:"maps"`
	Ready     bool   `json:"ready"`
	Protected bool   `json:"protected"`
	CheckedAt string `json:"checkedAt"`
}

func countMaps(root string) int {
	entries, err := os.ReadDir(filepath.Join(root, "maps"))
	if err != nil {
		return 0
	}
	n := 0
	for _, e := range entries {
		if e.IsDir() {
			n++
		}
	}
	return n
}

func (c config) health(w http.ResponseWriter, _ *http.Request) {
	_, err := os.Stat(filepath.Join(c.root, "index.html"))
	ready := err == nil
	status := "empty"
	if ready {
		status = "ok"
	}
	body := healthBody{
		Status:    status,
		Label:     c.healthLabel,
		Title:     c.title,
		Version:   version,
		Maps:      countMaps(c.root),
		Ready:     ready,
		Protected: c.authRequired(),
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if !ready {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	_ = json.NewEncoder(w).Encode(body)
}

// resolve maps a URL path to a file under root. path.Clean on a rooted path removes every
// `..` before the join, so nothing can leave root; the Rel check is a second, independent
// proof of the same thing.
func resolve(root, urlPath string) (string, bool) {
	clean := path.Clean("/" + urlPath)
	full := filepath.Join(root, filepath.FromSlash(clean))
	rel, err := filepath.Rel(root, full)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", false
	}
	return full, true
}

func isFile(p string) bool {
	info, err := os.Stat(p)
	return err == nil && info.Mode().IsRegular()
}

func contentTypeFor(p string) string {
	switch strings.ToLower(filepath.Ext(p)) {
	case ".json":
		return "application/json"
	case ".png":
		return "image/png"
	}
	return "application/octet-stream"
}

func (c config) serveFiles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	target, ok := resolve(c.root, r.URL.Path)
	if !ok {
		http.NotFound(w, r)
		return
	}
	if info, err := os.Stat(target); err == nil && info.IsDir() {
		target = filepath.Join(target, "index.html")
	}
	switch {
	case isFile(target):
		if strings.HasSuffix(target, ".gz") {
			// clientDecompression: the viewer inflates this itself, so it must arrive as
			// the gzip bytes it asked for, not decoded for it.
			w.Header().Set("Content-Type", "application/gzip")
		}
		http.ServeFile(w, r, target)
	case isFile(target + ".gz"):
		// The viewer asked for `x` and only `x.gz` exists: answer the way BlueMap's own
		// server does, with the gzip stream labelled as the encoding of the original.
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Vary", "Accept-Encoding")
		w.Header().Set("Content-Type", contentTypeFor(target))
		http.ServeFile(w, r, target+".gz")
	default:
		if r.URL.Path == "/" || r.URL.Path == "" {
			c.emptyPage(w)
			return
		}
		http.NotFound(w, r)
	}
}

func (c config) emptyPage(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusServiceUnavailable)
	fmt.Fprintf(w, "<!doctype html><meta charset=utf-8><title>%s</title><p>%s: no map files have been copied in yet.</p>",
		html.EscapeString(c.title), html.EscapeString(c.healthLabel))
}

func (c config) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", c.health)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if !c.allowed(r) {
			time.Sleep(300 * time.Millisecond) // slows guessing without a lockout to abuse
			w.Header().Set("WWW-Authenticate", `Basic realm="`+strings.ReplaceAll(c.title, `"`, "")+`", charset="UTF-8"`)
			http.Error(w, "an access code is required", http.StatusUnauthorized)
			return
		}
		c.serveFiles(w, r)
	})
	return mux
}

func main() {
	if len(os.Args) >= 3 && os.Args[1] == "--extract-tar" {
		if err := extractTar(os.Stdin, os.Args[2]); err != nil {
			fmt.Fprintln(os.Stderr, "extract failed:", err)
			os.Exit(1)
		}
		return
	}
	if len(os.Args) >= 2 && os.Args[1] == "--healthcheck" {
		// Used by `docker run --health-cmd`: there is no curl in an empty image.
		addr := os.Getenv("MAP_ADDR")
		if addr == "" {
			addr = defaultAddr
		}
		port := addr[strings.LastIndex(addr, ":")+1:]
		client := http.Client{Timeout: 3 * time.Second}
		resp, err := client.Get("http://127.0.0.1:" + port + "/health")
		if err != nil || resp.StatusCode != http.StatusOK {
			os.Exit(1)
		}
		return
	}
	c := loadConfig()
	srv := &http.Server{
		Addr:              c.addr,
		Handler:           c.handler(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	fmt.Println("map server", version, "listening on", c.addr, "serving", c.root, "protected:", c.authRequired())
	if err := srv.ListenAndServe(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
