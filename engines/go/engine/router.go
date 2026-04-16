package engine

import (
	"os"
	"path/filepath"
	"strings"
)

type RouteResult struct {
	FilePath string
	Params   map[string]string
	Found    bool
}

func ResolveRoute(templateDir, urlPath string) RouteResult {
	if urlPath == "" || urlPath == "/" {
		urlPath = "/index"
	}
	urlPath = strings.TrimSuffix(urlPath, "/")

	// Static: exact match
	exact := filepath.Join(templateDir, urlPath+".htx")
	if fileExists(exact) {
		return RouteResult{FilePath: exact, Params: map[string]string{}, Found: true}
	}

	// Index: directory/index.htx
	idx := filepath.Join(templateDir, urlPath, "index.htx")
	if fileExists(idx) {
		return RouteResult{FilePath: idx, Params: map[string]string{}, Found: true}
	}

	// Dynamic: walk segments
	segments := strings.Split(strings.TrimPrefix(urlPath, "/"), "/")
	return dynamicResolve(templateDir, segments, 0, map[string]string{})
}

func dynamicResolve(baseDir string, segments []string, idx int, params map[string]string) RouteResult {
	if idx >= len(segments) {
		// Check for index.htx in current dir
		idxFile := filepath.Join(baseDir, "index.htx")
		if fileExists(idxFile) {
			return RouteResult{FilePath: idxFile, Params: copyMap(params), Found: true}
		}
		return RouteResult{Found: false}
	}

	seg := segments[idx]
	isLast := idx == len(segments)-1

	// Try exact match first
	if isLast {
		exact := filepath.Join(baseDir, seg+".htx")
		if fileExists(exact) {
			return RouteResult{FilePath: exact, Params: copyMap(params), Found: true}
		}
	} else {
		subDir := filepath.Join(baseDir, seg)
		if dirExists(subDir) {
			result := dynamicResolve(subDir, segments, idx+1, params)
			if result.Found {
				return result
			}
		}
	}

	// Try dynamic [param].htx or [param]/ directory
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return RouteResult{Found: false}
	}

	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasPrefix(name, "[") {
			continue
		}

		if isLast && !entry.IsDir() && strings.HasSuffix(name, "].htx") {
			paramName := name[1 : len(name)-5]
			newParams := copyMap(params)
			newParams[paramName] = seg
			return RouteResult{
				FilePath: filepath.Join(baseDir, name),
				Params:   newParams,
				Found:    true,
			}
		}

		if entry.IsDir() && strings.HasSuffix(name, "]") {
			paramName := name[1 : len(name)-1]
			newParams := copyMap(params)
			newParams[paramName] = seg
			result := dynamicResolve(filepath.Join(baseDir, name), segments, idx+1, newParams)
			if result.Found {
				return result
			}
		}
	}

	return RouteResult{Found: false}
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func copyMap(m map[string]string) map[string]string {
	c := make(map[string]string, len(m))
	for k, v := range m {
		c[k] = v
	}
	return c
}
