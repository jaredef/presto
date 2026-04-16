package engine

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var (
	reInclude   = regexp.MustCompile(`<htx:include\s+src\s*=\s*"([^"]+)"\s*/>`)
	reComponent = regexp.MustCompile(`<htx:component\s+src\s*=\s*"([^"]+)"([^>]*)(?:/>|>([\s\S]*?)</htx:component>)`)
	reProps     = regexp.MustCompile(`<htx:props>([\s\S]*?)</htx:props>`)
	rePropLine  = regexp.MustCompile(`(\w+)\s*=\s*"([^"]*)"`)
	reSlot      = regexp.MustCompile(`<htx:slot\s*/>`)
	reHtxScript = regexp.MustCompile(`<htx:script>([\s\S]*?)</htx:script>`)
	reLet       = regexp.MustCompile(`<htx:let\s+([a-zA-Z_]\w*)\s*=\s*"([^"]*)"\s*/>`)
	reData      = regexp.MustCompile(`<htx:data\s+([^>]*)/>`)
	reGrant     = regexp.MustCompile(`<htx:grant\s+([^>]*)/>`)
	reAction    = regexp.MustCompile(`<htx:action\s+([^>]*)/>`)
	reAuth      = regexp.MustCompile(`<htx:auth(?:\s+role="([^"]*)")?\s*>([\s\S]*?)</htx:auth>`)
	reUnauth    = regexp.MustCompile(`<htx:unauth\s*>([\s\S]*?)</htx:unauth>`)
	reEach      = regexp.MustCompile(`<htx:each\s+items="([^"]+)"\s+as="([^"]+)"\s*>([\s\S]*?)</htx:each>`)
	reEmpty     = regexp.MustCompile(`<htx:empty\s*/?>`)
	reIf        = regexp.MustCompile(`<htx:if\s+test="([^"]+)"\s*>([\s\S]*?)</htx:if>(?:\s*<htx:else\s*>([\s\S]*?)</htx:else>)?`)
	reLayout    = regexp.MustCompile(`(?i)<htx:layout(?:\s+(?:src\s*=\s*"([^"]*)"|(none)))?\s*(?:/>|></htx:layout>)`)
	reStripHtx  = regexp.MustCompile(`</?htx:[^>]*>`)
	reAttrKV    = regexp.MustCompile(`(\w[\w-]*)\s*=\s*"([^"]*)"`)
	reCompProp  = regexp.MustCompile(`\{\{\s*(\w+)\s*\}\}`)
	reRawStrip  = regexp.MustCompile(`(?i)</?htx:raw(?:\s[^>]*)?>`)
)

type Engine struct {
	TemplateDir string
	PublicDir   string
	Adapter     ContentAdapter
	Registry    *ModuleRegistry
	Secret      string
}

func NewEngine(templateDir, publicDir, secret string, adapter ContentAdapter, registry *ModuleRegistry) *Engine {
	return &Engine{
		TemplateDir: templateDir,
		PublicDir:   publicDir,
		Adapter:     adapter,
		Registry:    registry,
		Secret:      secret,
	}
}

func (e *Engine) Resolve(templatePath string, req *HtxRequest) (string, error) {
	content, err := os.ReadFile(templatePath)
	if err != nil {
		return "", err
	}
	html := string(content)

	ctx := NewDataContext()

	// Stage 4: Context provider injection
	for name, provider := range e.Registry.ContextProviders {
		data := provider.Resolve(req)
		for k, v := range data {
			ctx.Set(k, v)
		}
		_ = name
	}

	// Inject route params
	if req != nil && req.Params != nil {
		params := make(map[string]interface{})
		for k, v := range req.Params {
			params[k] = v
		}
		ctx.Set("params", params)
	}

	var scriptCollector []string

	// Stage 6: Include expansion
	html = e.resolveIncludes(html, filepath.Dir(templatePath), 0)

	// Stage 7: Component resolution
	html = e.resolveComponents(html, &scriptCollector)

	// Stage 8: Page-level htx:script extraction
	html = reHtxScript.ReplaceAllStringFunc(html, func(m string) string {
		matches := reHtxScript.FindStringSubmatch(m)
		scriptCollector = append(scriptCollector, matches[1])
		return ""
	})

	// Stage 9: htx:let binding
	html = reLet.ReplaceAllStringFunc(html, func(m string) string {
		matches := reLet.FindStringSubmatch(m)
		// Evaluate any {htx:} expressions in the value
		val := reHtxAttr.ReplaceAllStringFunc(matches[2], func(a string) string {
			am := reHtxAttr.FindStringSubmatch(a)
			v := ResolvePath(ctx, am[1])
			return ToString(v)
		})
		ctx.Set(matches[1], val)
		return ""
	})

	// Stage 10: htx:data resolution
	html = e.resolveData(html, ctx)

	// Stage 11: htx:grant resolution
	html = e.resolveGrants(html, ctx, req)

	// Stage 12: htx:action resolution
	html = e.resolveActions(html, ctx)

	// Stage 13: htx:auth / htx:unauth
	html = e.resolveAuth(html, ctx)

	// Stage 14: Control flow (each/if)
	html = e.resolveControlFlow(html, ctx)

	// Stage 15: Expression evaluation
	html = EvalExpressions(html, ctx)

	// Extract layout directive before stripping (needed for stage 18)
	var layoutDirective []string
	if lm := reLayout.FindStringSubmatch(html); lm != nil {
		layoutDirective = lm
		html = reLayout.ReplaceAllString(html, "")
	}

	// Protect htx:raw blocks from stage 16 strip
	var rawProtected []protectedBlock
	rawCounter := 0
	html = reRawBlock.ReplaceAllStringFunc(html, func(m string) string {
		marker := fmt.Sprintf("__PRESTO_RAW_PROTECT_%d__", rawCounter)
		rawCounter++
		rawProtected = append(rawProtected, protectedBlock{marker, m})
		return marker
	})

	// Stage 16: Strip remaining htx: directives
	html = reStripHtx.ReplaceAllString(html, "")

	// Restore raw blocks
	for _, pb := range rawProtected {
		html = strings.Replace(html, pb.marker, pb.content, 1)
	}

	// Stage 18: Layout wrapping
	html = e.resolveLayoutWithDirective(html, templatePath, req, layoutDirective)

	// Stage 19: Post-layout pass
	html = e.postLayoutPass(html, ctx, req)

	// Stage 20: Script injection
	if len(scriptCollector) > 0 {
		scriptBlock := "<!--PRESTO:SCRIPT:BEGIN-->\n"
		for _, s := range scriptCollector {
			scriptBlock += "<htx:raw><script>" + strings.TrimSpace(s) + "</script></htx:raw>\n"
		}
		scriptBlock += "<!--PRESTO:SCRIPT:END-->"

		if idx := strings.LastIndex(html, "</body>"); idx >= 0 {
			html = html[:idx] + scriptBlock + "\n" + html[idx:]
		} else {
			html += "\n" + scriptBlock
		}
	}

	// Stage 21: Final expression pass for injected scripts
	html = EvalExpressions(html, ctx)

	// Stage 22: Replace PRESTO:SCRIPT placeholders, strip htx:raw wrappers
	html = strings.ReplaceAll(html, "<!--PRESTO:SCRIPT:BEGIN-->\n", "")
	html = strings.ReplaceAll(html, "<!--PRESTO:SCRIPT:BEGIN-->", "")
	html = strings.ReplaceAll(html, "<!--PRESTO:SCRIPT:END-->", "")
	html = reRawStrip.ReplaceAllString(html, "")

	return html, nil
}

func (e *Engine) resolveIncludes(html, currentDir string, depth int) string {
	if depth > 10 {
		return html
	}
	return reInclude.ReplaceAllStringFunc(html, func(m string) string {
		matches := reInclude.FindStringSubmatch(m)
		src := matches[1]
		path := e.resolveTemplatePath(src, currentDir)
		content, err := os.ReadFile(path)
		if err != nil {
			return fmt.Sprintf("<!-- include error: %s -->", src)
		}
		return e.resolveIncludes(string(content), filepath.Dir(path), depth+1)
	})
}

func (e *Engine) resolveComponents(html string, scriptCollector *[]string) string {
	for {
		if !reComponent.MatchString(html) {
			break
		}
		html = reComponent.ReplaceAllStringFunc(html, func(m string) string {
			matches := reComponent.FindStringSubmatch(m)
			src := matches[1]
			attrStr := matches[2]
			slotContent := matches[3]

			compPath := filepath.Join(e.TemplateDir, src)
			compBytes, err := os.ReadFile(compPath)
			if err != nil {
				return fmt.Sprintf("<!-- component error: %s -->", src)
			}
			compHTML := string(compBytes)

			// Parse default props
			defaults := map[string]string{}
			if pm := reProps.FindStringSubmatch(compHTML); pm != nil {
				for _, pl := range rePropLine.FindAllStringSubmatch(pm[1], -1) {
					defaults[pl[1]] = pl[2]
				}
				compHTML = reProps.ReplaceAllString(compHTML, "")
			}

			// Override with passed attributes
			props := map[string]string{}
			for k, v := range defaults {
				props[k] = v
			}
			for _, av := range reAttrKV.FindAllStringSubmatch(attrStr, -1) {
				if av[1] != "src" {
					props[av[1]] = av[2]
				}
			}

			// Replace {{ prop }} in component
			compHTML = reCompProp.ReplaceAllStringFunc(compHTML, func(pm string) string {
				pMatches := reCompProp.FindStringSubmatch(pm)
				if v, ok := props[pMatches[1]]; ok {
					return v
				}
				return pm
			})

			// Inject slot content
			compHTML = reSlot.ReplaceAllString(compHTML, slotContent)

			// Extract htx:script from component
			compHTML = reHtxScript.ReplaceAllStringFunc(compHTML, func(sm string) string {
				sMatches := reHtxScript.FindStringSubmatch(sm)
				*scriptCollector = append(*scriptCollector, sMatches[1])
				return ""
			})

			return compHTML
		})
	}
	return html
}

func (e *Engine) resolveData(html string, ctx *DataContext) string {
	return reData.ReplaceAllStringFunc(html, func(m string) string {
		matches := reData.FindStringSubmatch(m)
		attrs := parseAttrs(matches[1])

		typeName := attrs["type"]
		as := attrs["as"]
		if typeName == "" || as == "" {
			return ""
		}

		if slug, ok := attrs["slug"]; ok && slug != "" {
			record, err := e.Adapter.Get(typeName, map[string]string{"slug": slug})
			if err == nil && record != nil {
				ctx.Set(as, record)
			}
		} else {
			params := QueryParams{
				Type:   typeName,
				Where:  attrs["where"],
				Order:  attrs["order"],
				Limit:  attrs["limit"],
				Offset: attrs["offset"],
			}
			records, err := e.Adapter.Query(params)
			if err == nil {
				iface := make([]interface{}, len(records))
				for i, r := range records {
					iface[i] = r
				}
				ctx.Set(as, iface)
			}
		}
		return ""
	})
}

func (e *Engine) resolveGrants(html string, ctx *DataContext, req *HtxRequest) string {
	return reGrant.ReplaceAllStringFunc(html, func(m string) string {
		matches := reGrant.FindStringSubmatch(m)
		attrs := parseAttrs(matches[1])

		grantType := attrs["type"]
		as := attrs["as"]
		if as == "" {
			as = grantType + "Token"
		}

		sub := ""
		if req != nil {
			if u, ok := req.Cookies["user_id"]; ok {
				sub = u
			}
		}

		switch grantType {
		case "websocket":
			token, _ := GenerateChannelToken(sub, "websocket", e.Secret)
			ctx.Set(as, token)
		case "channel":
			module := attrs["module"]
			token, _ := GenerateChannelToken(sub, "channel:"+module, e.Secret)
			ctx.Set(as, token)
		case "asset":
			path := attrs["path"]
			signed := SignURL(path, e.Secret)
			ctx.Set(as, signed)
		}
		return ""
	})
}

func (e *Engine) resolveActions(html string, ctx *DataContext) string {
	actions := make(map[string]interface{})

	html = reAction.ReplaceAllStringFunc(html, func(m string) string {
		matches := reAction.FindStringSubmatch(m)
		attrs := parseAttrs(matches[1])

		name := attrs["name"]
		typeName := attrs["type"]
		recordId := attrs["record"]

		// Evaluate {htx:} in record
		recordId = reHtxAttr.ReplaceAllStringFunc(recordId, func(a string) string {
			am := reHtxAttr.FindStringSubmatch(a)
			v := ResolvePath(ctx, am[1])
			return ToString(v)
		})

		token, _ := GenerateActionToken(name, typeName, recordId, e.Secret)
		actions[name] = token
		return ""
	})

	if len(actions) > 0 {
		ctx.Set("$actions", actions)
	}
	return html
}

func (e *Engine) resolveAuth(html string, ctx *DataContext) string {
	authUser := resolveDataPath(ctx, "auth.user")

	html = reAuth.ReplaceAllStringFunc(html, func(m string) string {
		matches := reAuth.FindStringSubmatch(m)
		role := matches[1]
		content := matches[2]

		if !IsTruthy(authUser) {
			return ""
		}
		if role != "" {
			if userMap, ok := authUser.(map[string]interface{}); ok {
				if userRole, _ := userMap["role"].(string); userRole != role {
					return ""
				}
			} else {
				return ""
			}
		}
		return content
	})

	html = reUnauth.ReplaceAllStringFunc(html, func(m string) string {
		matches := reUnauth.FindStringSubmatch(m)
		if IsTruthy(authUser) {
			return ""
		}
		return matches[1]
	})

	return html
}

func (e *Engine) resolveControlFlow(html string, ctx *DataContext) string {
	// Process htx:each
	for reEach.MatchString(html) {
		html = reEach.ReplaceAllStringFunc(html, func(m string) string {
			matches := reEach.FindStringSubmatch(m)
			itemsPath := matches[1]
			asName := matches[2]
			body := matches[3]

			// Split body on htx:empty
			mainBody := body
			emptyBody := ""
			if parts := reEmpty.Split(body, 2); len(parts) == 2 {
				mainBody = parts[0]
				emptyBody = parts[1]
			}

			items := ResolvePath(ctx, itemsPath)
			arr, ok := items.([]interface{})
			if !ok || len(arr) == 0 {
				return strings.TrimSpace(emptyBody)
			}

			var result strings.Builder
			for i, item := range arr {
				child := ctx.Child()
				child.Set(asName, item)
				child.Set("$index", i)
				child.Set("$first", i == 0)
				child.Set("$last", i == len(arr)-1)

				fragment := e.resolveControlFlow(mainBody, child)
				fragment = EvalExpressions(fragment, child)
				result.WriteString(fragment)
			}
			return result.String()
		})
	}

	// Process htx:if
	for reIf.MatchString(html) {
		html = reIf.ReplaceAllStringFunc(html, func(m string) string {
			matches := reIf.FindStringSubmatch(m)
			testPath := matches[1]
			ifContent := matches[2]
			elseContent := matches[3]

			val := ResolvePath(ctx, testPath)
			if IsTruthy(val) {
				result := e.resolveControlFlow(ifContent, ctx)
				return EvalExpressions(result, ctx)
			}
			if elseContent != "" {
				result := e.resolveControlFlow(elseContent, ctx)
				return EvalExpressions(result, ctx)
			}
			return ""
		})
	}

	return html
}

func (e *Engine) resolveLayoutWithDirective(html, templatePath string, req *HtxRequest, layoutDirective []string) string {
	// If layout directive was extracted earlier
	if layoutDirective != nil {
		html = strings.TrimSpace(html)

		if layoutDirective[2] == "none" {
			return html
		}
		if layoutDirective[1] != "" {
			layoutPath := e.resolveTemplatePath(layoutDirective[1], filepath.Dir(templatePath))
			layoutContent, err := os.ReadFile(layoutPath)
			if err != nil {
				return html
			}
			return strings.Replace(string(layoutContent), "__content__", html, 1)
		}
	}

	// HX-Request skips root layout
	if req != nil && req.Headers != nil && req.Headers["HX-Request"] == "true" {
		return html
	}

	// Walk up directory tree for _layout.htx
	dir := filepath.Dir(templatePath)
	rootDir := e.TemplateDir

	var layouts []string
	for {
		layoutFile := filepath.Join(dir, "_layout.htx")
		if fileExists(layoutFile) {
			layouts = append([]string{layoutFile}, layouts...)
			content, _ := os.ReadFile(layoutFile)
			if strings.Contains(string(content), "<!DOCTYPE") || strings.Contains(string(content), "<!doctype") {
				break
			}
		}
		if dir == rootDir || dir == "/" || dir == "." {
			break
		}
		dir = filepath.Dir(dir)
	}

	result := html
	for _, layoutFile := range layouts {
		content, err := os.ReadFile(layoutFile)
		if err != nil {
			continue
		}
		result = strings.Replace(string(content), "__content__", result, 1)
	}

	return result
}

func (e *Engine) postLayoutPass(html string, ctx *DataContext, req *HtxRequest) string {
	// Re-run includes, auth, control flow, expressions on layout content
	html = e.resolveIncludes(html, e.TemplateDir, 0)
	html = e.resolveAuth(html, ctx)
	html = e.resolveControlFlow(html, ctx)
	html = EvalExpressions(html, ctx)
	return html
}

func (e *Engine) resolveTemplatePath(src, currentDir string) string {
	if strings.Contains(src, "..") {
		return ""
	}
	if strings.HasPrefix(src, "/") {
		return filepath.Join(e.TemplateDir, src)
	}
	return filepath.Join(currentDir, src)
}

func parseAttrs(s string) map[string]string {
	attrs := map[string]string{}
	for _, m := range reAttrKV.FindAllStringSubmatch(s, -1) {
		attrs[m[1]] = m[2]
	}
	return attrs
}
