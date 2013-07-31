/* Copyright (c) 2013 Richard Rodger, MIT License */
"use strict";


var _     = require('underscore')
var async = require('async')



module.exports = function( options ) {
  var seneca = this
  var name   = 'account'

  seneca.depends(name,['user'])


  options = seneca.util.deepextend({
    loadlimit:3
  },options)
  


  var accountent = seneca.make$('sys','account')
  var userent    = seneca.make$('sys','user')


  seneca.add({role:name,cmd:'create'},create_account)
  seneca.add({role:name,cmd:'resolve'},resolve_account)
  seneca.add({role:name,cmd:'suspend'},suspend_account)
  seneca.add({role:name,cmd:'primary'},primary_account)
  seneca.add({role:name,cmd:'adduser'},adduser)
  seneca.add({role:name,cmd:'removeuser'},removeuser)


  seneca.add({role:'user',cmd:'register'},user_register)
  seneca.add({role:'user',cmd:'login'},user_login)


  seneca.act({
    role:'util',
    cmd:'ensure_entity',
    pin:{role:name,cmd:'*'},
    entmap:{
      account:accountent,
      user:userent,
    }
  })



  
  var pin = seneca.pin({role:name,cmd:'*'})


  function addaccount( user, account ) {
    if( account ) {
      user.accounts = user.accounts || []
      user.accounts.push( account.id )
      user.accounts = _.uniq(user.accounts)
    }
  }


  function loadaccounts( user, done ) {
    async.mapLimit(user.accounts||[],options.loadlimit,function(accid,cb){
      if( accid && accid.entity$ ) return cb(null,accid);
      accountent.load$(accid,cb)

    }, function(err,results){
      if( results ) {
        user.accounts = results
      }
      done(err,user)
    })
  }

  
  function create_account( args, done ) {
    accountent.make$({
      name: args.name,
      active: void 0 == args.active ? true : !!args.active
    }).save$( done )
  }



  function resolve_account( args, done ) {
    var user   = args.user
    var account = args.account

    if( account ) {
      return done(null,account)
    }

    if( user.accounts && 0 < user.accounts.length) {
      return accountent.load$( user.accounts[0], done )
    }

    var accname = user.name + ' Account'
    pin.create({name:accname}, done)
  }


  function suspend_account( args, done ) {
    var account = args.account

    account.active = false
    account.save$(done)
  }


  function primary_account( args, done ) {
    var user    = args.user
    var account = args.account

    addaccount( user, account ) 
    user.accounts.unshift( account.id )
    user.accounts = _.uniq(user.accounts)

    user.save$(done)
  }


  function adduser( args, done ) {
    var user    = args.user
    var account = args.account

    addaccount( user, account ) 

    user.save$( done )
  }


  function removeuser( args, done ) {
    var user    = args.user
    var account = args.account

    user.accounts = user.accounts || []
    user.accounts = _.reject(user.accounts,function(accid){return accid==account.id})

    user.save$( done )
  }


  function user_register( args, done ) {
    this.prior( args, function( err, out ) {
      if( err ) return done( err );
      
      var resargs = {user:out.user}
      if( args.account ) resargs.account = args.account;

      pin.resolve(resargs, function( err, account ){
        if( err ) return done( err );

        addaccount( out.user, account ) 
        delete out.user.account

        out.user.save$( function( err, user ){
          if( err ) return done( err );

          loadaccounts(user,done)
        })
      })
    })
  }
  

  function user_login( args, done ) {
    this.prior( args, function( err, out ) {
      if( err ) return done( err );
      
      loadaccounts(out.user, function(err, user){
        if( err ) return done( err );
        
        out.user = user
        done(null,out)
      })
    })
  }


  seneca.add({init:name}, function( args, done ){
    seneca.act('role:util, cmd:define_sys_entity', {list:[accountent.canon$()]})
  })


  return {
    name: name
  }
}
