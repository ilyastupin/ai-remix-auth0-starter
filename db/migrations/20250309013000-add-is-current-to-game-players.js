'use strict'

const fs = require('fs')
const path = require('path')

let dbm
let type
let seed

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate
  type = dbm.dataType
  seed = seedLink
}

function getSql(file) {
  const filePath = path.join(__dirname, '..', 'sqls', file)
  return fs.readFileSync(filePath, 'utf8')
}

exports.up = function (db) {
  return db.runSql(getSql('20250309013000-add-is-current-to-game-players-up.sql'))
}

exports.down = function (db) {
  return db.runSql(getSql('20250309013000-add-is-current-to-game-players-down.sql'))
}

exports._meta = {
  version: 1
}
