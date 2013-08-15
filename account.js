/* Copyright (c) 2013 Richard Rodger, MIT License */
"use strict";


var _     = require('underscore')
var async = require('async')



module.exports = function( options ) {
  var seneca = this
  var name   = 'account'

  seneca.depends(name,[
    'user' // overrides some actions
  ])


  options = seneca.util.deepextend({
    loadlimit:3
  },options)
  

  var accountent = seneca.make$( 'sys/account' )
  var userent    = seneca.make$( 'sys/user' )


  // actions provided
  seneca.add( {role:name, cmd:'create'},     create_account )
  seneca.add( {role:name, cmd:'resolve'},    resolve_account )
  seneca.add( {role:name, cmd:'suspend'},    suspend_account )
  seneca.add( {role:name, cmd:'primary'},    primary_account )
  seneca.add( {role:name, cmd:'adduser'},    adduser )
  seneca.add( {role:name, cmd:'removeuser'}, removeuser )


  // actions overridden
  seneca.add( {role:'user', cmd:'register' }, user_register )
  seneca.add( {role:'user', cmd:'login' },    user_login )


  // resolve entity args by id
  seneca.act({
    role:   'util',
    cmd:    'ensure_entity',
    pin:    { role:name, cmd:'*' },
    entmap: {
      account: accountent,
      user:    userent,
    }
  })

  
  var pin = seneca.pin({ role:name, cmd:'*' })


  // add refent.id to array prop on ent
  function additem( ent, refent, name ) {
    if( ent && refent && name ) {
      ent[name] = ent[name] || []
      ent[name].push( refent.id )
      ent[name] = _.uniq( ent[name] )
    }
  }


  // save user and account, provide {user:, account:} 
  function save( user, account, done ) {
    user.save$(function(err,user){
      if(err) return done(err);

      account.save$(function(err,account){
        if(err) return done(err);

        done(null,{user:user,account:account})
      })
    })
  }


  // load the account entities for a user, id array in user.accounts property
  function loadaccounts( user, done ) {
    async.mapLimit( user.accounts||[], options.loadlimit, function(accid,cb){

      // already loaded
      if( accid && accid.entity$ ) return cb(null,accid);

      accountent.load$(accid,cb)

    }, function(err,results){
      if( err ) return done(err);

      if( results ) {
        var accounts = []
        _.each( results, function( accent, i ){
          if( accent ) {
            accounts.push(accent)
          }
          else seneca.log.warn('account-not-found', user.accounts[i], user.id, user);
        })
        user.accounts = accounts
      }
      done(null,user)
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

    additem( user,    account, 'accounts' ) 
    additem( account, user,    'users'    ) 

    user.accounts.unshift( account.id )
    user.accounts = _.uniq(user.accounts)

    save( user, account, done ) 
  }



  function adduser( args, done ) {
    var user    = args.user
    var account = args.account

    additem( user,    account, 'accounts' ) 
    additem( account, user,    'users'    ) 

    save( user, account, done ) 
  }



  function removeuser( args, done ) {
    var user    = args.user
    var account = args.account

    user.accounts = user.accounts || []
    user.accounts = _.reject(user.accounts,function(accid){return accid==account.id})

    account.users = account.users || []
    account.users = _.reject(account.users,function(accid){return accid==account.id})

    save( user, account, done ) 
  }



  function user_register( args, done ) {
    this.prior( args, function( err, out ) {
      if( err ) return done( err );
      
      var resargs = {user:out.user}
      if( args.account ) resargs.account = args.account;

      pin.resolve(resargs, function( err, account ){
        if( err ) return done( err );

        additem( out.user, account, 'accounts' ) 
        additem( account, out.user, 'users' ) 
        delete out.user.account

        out.user.save$( function( err, user ){
          if( err ) return done( err );

          account.save$( function( err, account ){
            if( err ) return done( err );

            loadaccounts(user,function( err, user ){
              out.user = user
              done( err, out )
            })
          })
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
