package engine

// DataContext holds the hierarchical data for template resolution.
type DataContext struct {
	data   map[string]interface{}
	parent *DataContext
}

func NewDataContext() *DataContext {
	return &DataContext{data: make(map[string]interface{})}
}

func (dc *DataContext) Set(key string, value interface{}) {
	dc.data[key] = value
}

func (dc *DataContext) Get(key string) (interface{}, bool) {
	if v, ok := dc.data[key]; ok {
		return v, true
	}
	if dc.parent != nil {
		return dc.parent.Get(key)
	}
	return nil, false
}

func (dc *DataContext) Child() *DataContext {
	return &DataContext{data: make(map[string]interface{}), parent: dc}
}

func (dc *DataContext) Merge(other map[string]interface{}) {
	for k, v := range other {
		dc.data[k] = v
	}
}

func (dc *DataContext) All() map[string]interface{} {
	result := make(map[string]interface{})
	if dc.parent != nil {
		for k, v := range dc.parent.All() {
			result[k] = v
		}
	}
	for k, v := range dc.data {
		result[k] = v
	}
	return result
}
