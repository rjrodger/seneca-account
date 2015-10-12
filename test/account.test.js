/* Copyright (c) 2010-2013 Richard Rodger */
'use strict'

var Lab = require('lab')
var Seneca = require('seneca')

var lab = exports.lab = Lab.script()
var describe = lab.describe
var before = lab.before

var it = lab.it
var assert = require('chai').assert

var _ = require('lodash')

function cberr (win) {
  return function (err) {
    if (err) {
      assert.fail(err, 'callback error')
    } else {
      win.apply(this, Array.prototype.slice.call(arguments, 1))
    }
  }
}

var si = Seneca()
si.use('user')
si.use('auth')
si.use('..')

var accpin = si.pin({role: 'account', cmd: '*'})
var userpin = si.pin({role: 'user', cmd: '*'})

var accountent = si.make$('sys', 'account')

describe('user', function () {
  describe('happy', function () {
    var tmp = {}

    before(function (done) {
      si.ready(done)
    })

    it('auto_create_account', function (cb) {
      userpin.register({name: 'N1', nick: 'n1'}, cberr(function (out) {
        assert.equal(1, out.user.accounts.length)
        accpin.load_accounts({user: out.user}, cberr(function (res) {
          tmp.ac1 = res.accounts[0]
          cb()
        }))
      }))
    })

    it('load_auto_account', function (cb) {
      accountent.load$(tmp.ac1.id, cberr(function (acc) {
        assert.isNotNull(acc)
        cb()
      }))
    })

    it('existing_account', function (cb) {
      userpin.register({name: 'N2', nick: 'n2', account: tmp.ac1.id}, cberr(function (out) {
        assert.equal(1, out.user.accounts.length)
        assert.equal(tmp.ac1.id, out.user.accounts[0])
        cb()
      }))
    })

    it('primary_account', function (cb) {
      userpin.register({name: 'N3', nick: 'n3', accounts: [tmp.ac1.id]}, cberr(function (out) {
        assert.equal(1, out.user.accounts.length)
        assert.equal(tmp.ac1.id, out.user.accounts[0])
        cb()
      }))
    })

    it('user_login', function (cb) {
      userpin.login({nick: 'n1', auto: true}, cberr(function (out) {
        var user = out.user
        assert.equal(1, user.accounts.length)
        assert.equal(tmp.ac1.id, user.accounts[0])
        cb()
      }))
    })
  })

  it('loadaccounts--bad-account-id', function (cb) {
    si.logroute({level: 'warn'}, _.once(function () {
      assert.equal(arguments[5], 'account-not-found')
    }))

    accountent.make$({n: 'la1'}).save$(cberr(function (acc) {
      userpin.register({name: 'LA1', nick: 'la1', accounts: [acc.id, 'not-an-acc-id']}, cberr(function (out) {
        accpin.load_accounts({user: out.user}, cberr(function (res) {
          assert.equal(1, res.accounts.length)
          assert.equal(acc.id, res.accounts[0].id)
          cb()
        }))
      }))
    }))
  })
})
