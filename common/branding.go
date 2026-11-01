package common

import "strings"

const DefaultSystemName = "麟飞科技"

// ResolveSystemName maps inherited product defaults to the customer-facing brand.
// An explicitly configured company name remains supported; stored options are untouched.
func ResolveSystemName(name string) string {
	name = strings.TrimSpace(name)
	switch strings.ToLower(name) {
	case "", "new api", "new-api", "newapi":
		return DefaultSystemName
	default:
		return name
	}
}
