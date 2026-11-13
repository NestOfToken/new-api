package main

import (
	"fmt"
	"os"
	"reflect"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type indexSnapshot struct {
	Table string
	Names []string
}

type fixtureSnapshot struct {
	UserID        int
	Username      string
	DisplayName   string
	Quota         int
	UsedQuota     int
	TokenID       int
	TokenQuota    int
	ChannelID     int
	ChannelName   string
	ChannelModels string
	PlanID        int
	PlanPrice     float64
	LogID         int
	LogQuota      int
	LogOther      string
	Options       map[string]string
	Indexes       []indexSnapshot
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}

func snapshot() fixtureSnapshot {
	var user model.User
	must(model.DB.Where("username = ?", "rc51-matrix-user").First(&user).Error)
	var token model.Token
	must(model.DB.Where("name = ?", "rc51-matrix-token").First(&token).Error)
	var channel model.Channel
	must(model.DB.Where("name = ?", "rc51-matrix-channel").First(&channel).Error)
	var plan model.SubscriptionPlan
	must(model.DB.Where("title = ?", "rc51-matrix-plan").First(&plan).Error)
	var log model.Log
	must(model.LOG_DB.Where("request_id = ?", "rc51-matrix-log").First(&log).Error)
	result := fixtureSnapshot{
		UserID: user.Id, Username: user.Username, DisplayName: user.DisplayName, Quota: user.Quota, UsedQuota: user.UsedQuota,
		TokenID: token.Id, TokenQuota: token.RemainQuota, ChannelID: channel.Id, ChannelName: channel.Name, ChannelModels: channel.Models,
		PlanID: plan.Id, PlanPrice: plan.PriceAmount, LogID: log.Id, LogQuota: log.Quota, LogOther: log.Other, Options: map[string]string{},
	}
	for _, key := range []string{"SystemName", "Footer", "general_setting.docs_link", "ModelBillingExpr"} {
		var option model.Option
		must(model.DB.Where(&model.Option{Key: key}).First(&option).Error)
		result.Options[key] = option.Value
	}
	for _, entry := range []struct {
		db    *gorm.DB
		table string
	}{{model.DB, "users"}, {model.DB, "tokens"}, {model.DB, "channels"}, {model.DB, "options"}, {model.LOG_DB, "logs"}} {
		indexes, err := entry.db.Migrator().GetIndexes(entry.table)
		must(err)
		current := indexSnapshot{Table: entry.table}
		for _, index := range indexes {
			current.Names = append(current.Names, index.Name())
		}
		result.Indexes = append(result.Indexes, current)
	}
	return result
}

func main() {
	phase, statePath := os.Getenv("RC51_PHASE"), os.Getenv("RC51_STATE")
	common.InitEnv()
	common.IsMasterNode = true
	must(model.InitDB())
	must(model.InitLogDB())
	defer model.CloseDB()
	model.DB = model.DB.Session(&gorm.Session{Logger: logger.Default.LogMode(logger.Silent)})
	model.LOG_DB = model.LOG_DB.Session(&gorm.Session{Logger: logger.Default.LogMode(logger.Silent)})
	// UPGRADE_HOOK
	if phase == "fresh" {
		for _, entry := range []struct {
			db    *gorm.DB
			table string
		}{{model.DB, "users"}, {model.DB, "channels"}, {model.DB, "system_tasks"}, {model.LOG_DB, "logs"}} {
			if !entry.db.Migrator().HasTable(entry.table) {
				panic("missing table: " + entry.table)
			}
		}
	} else if phase == "seed" {
		hash, err := common.Password2Hash("rc51-fixture-only-password")
		must(err)
		user := model.User{Username: "rc51-matrix-user", Password: hash, DisplayName: "睿元云升级样本", Email: "matrix@example.invalid", Quota: 123456, UsedQuota: 654, AffCode: "rc51-fixture", AuthVersion: 1}
		must(model.DB.Create(&user).Error)
		must(model.DB.Create(&model.Token{UserId: user.Id, Key: strings.Repeat("a", 48), Name: "rc51-matrix-token", RemainQuota: 98765}).Error)
		must(model.DB.Create(&model.Channel{Type: 1, Key: "fixture-only", Status: 1, Name: "rc51-matrix-channel", Models: "gpt-matrix", Group: "default"}).Error)
		must(model.DB.Create(&model.SubscriptionPlan{Title: "rc51-matrix-plan", PriceAmount: 12.345678, Currency: "USD", DurationUnit: "month", DurationValue: 1, Enabled: true}).Error)
		must(model.LOG_DB.Create(&model.Log{UserId: user.Id, CreatedAt: 1700000000, Type: model.LogTypeConsume, Content: "rc51 matrix fixture", Quota: 246, RequestId: "rc51-matrix-log", Other: `{"billing_mode":"tiered_expr","image_count":2}`}).Error)
		options := map[string]string{"SystemName": "睿元云矩阵样本", "Footer": "<p>Customer footer</p>", "general_setting.docs_link": "https://docs.example.invalid/", "ModelBillingExpr": `{"gpt-matrix":"tier(\"base\", p * 2 + c * 6)"}`, "SensitiveWords": "rc51-fixture-keyword", "CheckSensitiveEnabled": "true", "CheckSensitiveOnPromptEnabled": "true"}
		for key, value := range options {
			must(model.DB.Save(&model.Option{Key: key, Value: value}).Error)
		}
		data, err := common.Marshal(snapshot())
		must(err)
		must(os.WriteFile(statePath, data, 0600))
	} else if phase == "verify" {
		data, err := os.ReadFile(statePath)
		must(err)
		var before fixtureSnapshot
		must(common.Unmarshal(data, &before))
		after := snapshot()
		for _, table := range before.Indexes {
			db := model.DB
			if table.Table == "logs" {
				db = model.LOG_DB
			}
			for _, index := range table.Names {
				if !db.Migrator().HasIndex(table.Table, index) {
					panic("lost index: " + index)
				}
			}
		}
		after.Indexes = before.Indexes
		if !reflect.DeepEqual(before, after) {
			panic("representative data changed across upgrade")
		}
		var migrated model.Option
		must(model.DB.Where(&model.Option{Key: "request_plugin_setting.instances"}).First(&migrated).Error)
		var instances []struct {
			Plugin  string
			Enabled bool
			Global  bool
			Config  struct {
				Keywords              string
				KeywordsCaseSensitive bool
			}
		}
		must(common.UnmarshalJsonStr(migrated.Value, &instances))
		if len(instances) != 1 || instances[0].Plugin != "request-filter" || !instances[0].Enabled || !instances[0].Global || instances[0].Config.Keywords != "rc51-fixture-keyword" || instances[0].Config.KeywordsCaseSensitive {
			panic("sensitive word settings were not preserved")
		}
		for _, key := range []string{"SensitiveWords", "CheckSensitiveEnabled", "CheckSensitiveOnPromptEnabled"} {
			var count int64
			must(model.DB.Model(&model.Option{}).Where(&model.Option{Key: key}).Count(&count).Error)
			if count != 0 {
				panic("retired sensitive word option remains")
			}
		}
		previousMigration, err := os.ReadFile(statePath + ".migrated")
		if os.IsNotExist(err) {
			must(os.WriteFile(statePath+".migrated", []byte(migrated.Value), 0600))
		} else {
			must(err)
			if string(previousMigration) != migrated.Value {
				panic("sensitive word migration is not idempotent")
			}
		}
		duplicate := model.User{Username: before.Username, Password: "unused", AffCode: "different-fixture"}
		if model.DB.Create(&duplicate).Error == nil {
			panic("username uniqueness was lost")
		}
	} else {
		panic("unknown phase")
	}
	var version string
	query := "SELECT version()"
	if common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		query = "SELECT sqlite_version()"
	}
	must(model.DB.Raw(query).Scan(&version).Error)
	fmt.Printf("RC51_MATRIX_OK phase=%s engine=%s version=%s\n", phase, common.MainDatabaseType(), version)
}
