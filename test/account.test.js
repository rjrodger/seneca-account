/* Copyright (c) 2010-2013 Richard Rodger */
"use strict";

// mocha account.test.js


var seneca  = require('seneca')

var assert  = require('chai').assert

var gex     = require('gex')
var async   = require('async')
var _       = require('underscore')




function cberr(win){
  return function(err){
    if(err) {
      assert.fail(err, 'callback error')
    }
    else {
      win.apply(this,Array.prototype.slice.call(arguments,1))
    }
  }
}




var si = seneca()
si.use( 'user' )
si.use( '..' )

var accpin  = si.pin({role:'account',cmd:'*'})
var userpin = si.pin({role:'user',cmd:'*'})

var accountent = si.make$('sys','account')
var userent    = si.make$('sys','user')


describe('user', function() {
  
  it('happy', function() {
    var tmp = {}
    
    async.series({
      auto_create_account: function(cb){
        userpin.register({name:'N1',nick:'n1'},cberr(function(out){
          assert.equal( 1, out.user.accounts.length )
          tmp.ac1 = out.user.accounts[0]
          cb()
        }))
      },

      load_auto_account: function(cb){
        accountent.load$(tmp.ac1.id,cberr(function(acc){
          assert.isNotNull(acc)
          cb()
        }))
      },


      existing_account: function(cb){
        userpin.register({name:'N2',nick:'n2',account:tmp.ac1.id},cberr(function(out){
          assert.equal( 1, out.user.accounts.length )
          assert.equal( tmp.ac1.id, out.user.accounts[0].id )
          cb()
        }))
      },


      primary_account: function(cb){
        userpin.register({name:'N3',nick:'n3',accounts:[tmp.ac1.id]},cberr(function(out){
          assert.equal( 1, out.user.accounts.length )
          assert.equal( tmp.ac1.id, out.user.accounts[0].id )
          cb()
        }))
      },

      user_login: function(cb){
        userpin.login({nick:'n1',auto:true},cberr(function(out){
          var user = out.user
          assert.equal( 1, user.accounts.length )
          assert.equal( tmp.ac1.id, user.accounts[0].id )
          cb()
        }))
      },

    })
  })


  it('loadaccounts--bad-account-id', function(cb) {
    si.logroute({level:'warn'},_.once(function(){
      assert.equal(arguments[5],'account-not-found')
    }))

    accountent.make$({n:'la1'}).save$(cberr(function(acc){
      userpin.register({name:'LA1',nick:'la1',accounts:[acc.id,'not-an-acc-id']},cberr(function(out){
        assert.equal( 1, out.user.accounts.length )
        assert.equal( acc.id, out.user.accounts[0].id )
        cb()
      }))
    }))
  })
})
