package engine

import (
	"database/sql"
	"fmt"
	"strings"

	_ "github.com/mattn/go-sqlite3"
)

type ContentAdapter interface {
	Query(params QueryParams) ([]map[string]interface{}, error)
	Get(typeName string, identifier map[string]string) (map[string]interface{}, error)
	Create(typeName string, data map[string]interface{}) (map[string]interface{}, error)
	Update(typeName string, id string, data map[string]interface{}) (bool, error)
	Delete(typeName string, id string) (bool, error)
}

type QueryParams struct {
	Type   string
	Where  string
	Order  string
	Limit  string
	Offset string
}

type SQLiteAdapter struct {
	db *sql.DB
}

func NewSQLiteAdapter(dbPath string) (*SQLiteAdapter, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, err
	}
	return &SQLiteAdapter{db: db}, nil
}

func (a *SQLiteAdapter) Close() error {
	return a.db.Close()
}

func (a *SQLiteAdapter) DB() *sql.DB {
	return a.db
}

func (a *SQLiteAdapter) Query(params QueryParams) ([]map[string]interface{}, error) {
	query := fmt.Sprintf("SELECT * FROM %s", params.Type)
	if params.Where != "" {
		query += " WHERE " + params.Where
	}
	if params.Order != "" {
		query += " ORDER BY " + params.Order
	}
	if params.Limit != "" {
		query += " LIMIT " + params.Limit
	}
	if params.Offset != "" {
		query += " OFFSET " + params.Offset
	}

	rows, err := a.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRows(rows)
}

func (a *SQLiteAdapter) Get(typeName string, identifier map[string]string) (map[string]interface{}, error) {
	var query string
	if slug, ok := identifier["slug"]; ok {
		query = fmt.Sprintf("SELECT * FROM %s WHERE slug = '%s' LIMIT 1", typeName, slug)
	} else if id, ok := identifier["id"]; ok {
		query = fmt.Sprintf("SELECT * FROM %s WHERE id = '%s' LIMIT 1", typeName, id)
	} else {
		return nil, fmt.Errorf("no identifier provided")
	}

	rows, err := a.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	results, err := scanRows(rows)
	if err != nil || len(results) == 0 {
		return nil, err
	}
	return results[0], nil
}

func (a *SQLiteAdapter) Create(typeName string, data map[string]interface{}) (map[string]interface{}, error) {
	cols := []string{}
	vals := []interface{}{}
	placeholders := []string{}
	for k, v := range data {
		cols = append(cols, k)
		vals = append(vals, v)
		placeholders = append(placeholders, "?")
	}
	query := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		typeName, strings.Join(cols, ", "), strings.Join(placeholders, ", "))
	result, err := a.db.Exec(query, vals...)
	if err != nil {
		return nil, err
	}
	id, _ := result.LastInsertId()
	record := map[string]interface{}{"id": float64(id)}
	for k, v := range data {
		record[k] = v
	}
	return record, nil
}

func (a *SQLiteAdapter) Update(typeName string, id string, data map[string]interface{}) (bool, error) {
	sets := []string{}
	vals := []interface{}{}
	for k, v := range data {
		sets = append(sets, k+" = ?")
		vals = append(vals, v)
	}
	vals = append(vals, id)
	query := fmt.Sprintf("UPDATE %s SET %s WHERE id = ?", typeName, strings.Join(sets, ", "))
	result, err := a.db.Exec(query, vals...)
	if err != nil {
		return false, err
	}
	n, _ := result.RowsAffected()
	return n > 0, nil
}

func (a *SQLiteAdapter) Delete(typeName string, id string) (bool, error) {
	query := fmt.Sprintf("DELETE FROM %s WHERE id = ?", typeName)
	result, err := a.db.Exec(query, id)
	if err != nil {
		return false, err
	}
	n, _ := result.RowsAffected()
	return n > 0, nil
}

func scanRows(rows *sql.Rows) ([]map[string]interface{}, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}

	var results []map[string]interface{}
	for rows.Next() {
		values := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		row := make(map[string]interface{})
		for i, col := range cols {
			val := values[i]
			switch v := val.(type) {
			case []byte:
				row[col] = string(v)
			case int64:
				row[col] = float64(v)
			default:
				row[col] = v
			}
		}
		results = append(results, row)
	}
	return results, nil
}
