package engine

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

var (
	reHtxVTag  = regexp.MustCompile(`<htx:v(\s+raw)?(?:\s+path\s*=\s*"([^"]*)")?\s*(?:/>|>([\s\S]*?)</htx:v>)`)
	reHtxAttr  = regexp.MustCompile(`\{htx:([^}]+)\}`)
	reScript   = regexp.MustCompile(`(?i)<script(\s[^>]*)?>[\s\S]*?</script>`)
	reRawBlock = regexp.MustCompile(`(?i)<htx:raw(?:\s[^>]*)?>[\s\S]*?</htx:raw>`)
)

func ResolvePath(ctx *DataContext, path string) interface{} {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil
	}

	parts := strings.SplitN(path, "|", 2)
	dataPath := strings.TrimSpace(parts[0])
	var pipeName string
	if len(parts) == 2 {
		pipeName = strings.TrimSpace(parts[1])
	}

	val := resolveDataPath(ctx, dataPath)

	if pipeName != "" {
		val = applyPipe(val, pipeName)
	}
	return val
}

func resolveDataPath(ctx *DataContext, path string) interface{} {
	segments := strings.Split(path, ".")
	if len(segments) == 0 {
		return nil
	}

	root, ok := ctx.Get(segments[0])
	if !ok {
		return nil
	}

	current := root
	for _, seg := range segments[1:] {
		if current == nil {
			return nil
		}
		switch m := current.(type) {
		case map[string]interface{}:
			current = m[seg]
		default:
			return nil
		}
	}
	return current
}

func applyPipe(val interface{}, pipe string) interface{} {
	s := ToString(val)
	switch pipe {
	case "uppercase":
		return strings.ToUpper(s)
	case "lowercase":
		return strings.ToLower(s)
	case "capitalize":
		if len(s) == 0 {
			return s
		}
		runes := []rune(s)
		runes[0] = unicode.ToUpper(runes[0])
		return string(runes)
	case "trim":
		return strings.TrimSpace(s)
	case "length":
		switch v := val.(type) {
		case []interface{}:
			return len(v)
		case string:
			return len(v)
		default:
			return len(s)
		}
	case "json":
		b, err := json.Marshal(val)
		if err != nil {
			return s
		}
		return string(b)
	default:
		return val
	}
}

func HtmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}

func ToString(val interface{}) string {
	if val == nil {
		return ""
	}
	switch v := val.(type) {
	case string:
		return v
	case float64:
		if v == float64(int64(v)) {
			return fmt.Sprintf("%d", int64(v))
		}
		return fmt.Sprintf("%g", v)
	case int:
		return fmt.Sprintf("%d", v)
	case int64:
		return fmt.Sprintf("%d", v)
	case bool:
		if v {
			return "true"
		}
		return "false"
	default:
		return fmt.Sprintf("%v", v)
	}
}

func IsTruthy(val interface{}) bool {
	if val == nil {
		return false
	}
	switch v := val.(type) {
	case bool:
		return v
	case string:
		return v != ""
	case float64:
		return v != 0
	case int:
		return v != 0
	case int64:
		return v != 0
	case []interface{}:
		return len(v) > 0
	case map[string]interface{}:
		return true
	default:
		return true
	}
}

type protectedBlock struct {
	marker  string
	content string
}

func EvalExpressions(html string, ctx *DataContext) string {
	var protected []protectedBlock
	counter := 0

	// Protect script blocks
	html = reScript.ReplaceAllStringFunc(html, func(m string) string {
		marker := fmt.Sprintf("__PRESTO_PROTECT_%d__", counter)
		counter++
		protected = append(protected, protectedBlock{marker, m})
		return marker
	})

	// Protect raw blocks
	html = reRawBlock.ReplaceAllStringFunc(html, func(m string) string {
		marker := fmt.Sprintf("__PRESTO_PROTECT_%d__", counter)
		counter++
		protected = append(protected, protectedBlock{marker, m})
		return marker
	})

	// Replace htx:v tags
	html = reHtxVTag.ReplaceAllStringFunc(html, func(m string) string {
		matches := reHtxVTag.FindStringSubmatch(m)
		isRaw := strings.TrimSpace(matches[1]) == "raw"
		path := matches[2]
		if path == "" {
			path = matches[3]
		}
		val := ResolvePath(ctx, path)
		s := ToString(val)
		if !isRaw {
			s = HtmlEscape(s)
		}
		return s
	})

	// Replace {htx:} attribute bindings
	html = reHtxAttr.ReplaceAllStringFunc(html, func(m string) string {
		matches := reHtxAttr.FindStringSubmatch(m)
		path := matches[1]
		val := ResolvePath(ctx, path)
		return HtmlEscape(ToString(val))
	})

	// Restore protected blocks
	for _, pb := range protected {
		html = strings.Replace(html, pb.marker, pb.content, 1)
	}

	return html
}
