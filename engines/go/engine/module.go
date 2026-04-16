package engine

import "net/http"

type HtxRequest struct {
	Method  string
	Path    string
	Headers map[string]string
	Body    map[string]interface{}
	Cookies map[string]string
	Params  map[string]string
	Raw     *http.Request
}

type HtxResponse struct {
	StatusCode int
	Headers    map[string]string
	Body       string
}

type Module interface {
	Name() string
	Manifest() ModuleManifest
	Boot(registry *ModuleRegistry) error
}

type ModuleManifest struct {
	Trust            string   `json:"trust"`
	ContextProviders []string `json:"contextProviders,omitempty"`
	ChannelHandlers  []string `json:"channelHandlers,omitempty"`
	Middleware       []string `json:"middleware,omitempty"`
}

type Middleware interface {
	Name() string
	Handle(req *HtxRequest, next func() *HtxResponse) *HtxResponse
}

type ContextProvider interface {
	Resolve(req *HtxRequest) map[string]interface{}
}

type ChannelHandler interface {
	Module() string
	Handle(subPath string, query map[string]string, userId string, ctx ChannelContext) ChannelResponse
}

type ChannelContext struct {
	Method string
	Body   map[string]interface{}
}

type ChannelResponse struct {
	Status int
	Data   interface{}
}

type ModuleRegistry struct {
	Middlewares      []Middleware
	ContextProviders map[string]ContextProvider
	ChannelHandlers  map[string]ChannelHandler

	// For restricted proxies
	parent   *ModuleRegistry
	filterMW map[string]bool
	filterCP map[string]bool
	filterCH map[string]bool
}

func NewModuleRegistry() *ModuleRegistry {
	return &ModuleRegistry{
		ContextProviders: make(map[string]ContextProvider),
		ChannelHandlers:  make(map[string]ChannelHandler),
	}
}

func (r *ModuleRegistry) RegisterMiddleware(mw Middleware) {
	if r.parent != nil {
		if r.filterMW != nil && !r.filterMW[mw.Name()] {
			return
		}
		r.parent.RegisterMiddleware(mw)
		return
	}
	r.Middlewares = append(r.Middlewares, mw)
}

func (r *ModuleRegistry) RegisterContextProvider(name string, provider ContextProvider) {
	if r.parent != nil {
		if r.filterCP != nil && !r.filterCP[name] {
			return
		}
		r.parent.RegisterContextProvider(name, provider)
		return
	}
	r.ContextProviders[name] = provider
}

func (r *ModuleRegistry) RegisterChannelHandler(handler ChannelHandler) {
	if r.parent != nil {
		if r.filterCH != nil && !r.filterCH[handler.Module()] {
			return
		}
		r.parent.RegisterChannelHandler(handler)
		return
	}
	r.ChannelHandlers[handler.Module()] = handler
}

func BootModules(modules []Module, registry *ModuleRegistry) {
	for _, mod := range modules {
		manifest := mod.Manifest()
		if manifest.Trust == "first-party" {
			_ = mod.Boot(registry)
		} else {
			proxy := newRestrictedProxy(registry, manifest)
			_ = mod.Boot(proxy)
		}
	}
}

func newRestrictedProxy(real *ModuleRegistry, manifest ModuleManifest) *ModuleRegistry {
	return &ModuleRegistry{
		ContextProviders: make(map[string]ContextProvider),
		ChannelHandlers:  make(map[string]ChannelHandler),
		parent:           real,
		filterMW:         toSet(manifest.Middleware),
		filterCP:         toSet(manifest.ContextProviders),
		filterCH:         toSet(manifest.ChannelHandlers),
	}
}

func toSet(items []string) map[string]bool {
	s := make(map[string]bool, len(items))
	for _, item := range items {
		s[item] = true
	}
	return s
}
