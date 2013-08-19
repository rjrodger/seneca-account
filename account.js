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
    loadlimit:3,
    autoNameSuffix:' Account'
  },options)
  

  var accountent = seneca.make$( 'sys/account' )
  var userent    = seneca.make$( 'sys/user' )


  // actions provided
  seneca.add( {role:name, cmd:'create'},     
              {name:'required$,string$'}, 
              create_account )

  seneca.add( {role:name, cmd:'resolve'},    
              {user:'required$,object$', account:'object$'}, 
              resolve_account )

  seneca.add( {role:name, cmd:'load_accounts'},    
              {user:'required$,object$'}, 
              load_accounts )

  seneca.add( {role:name, cmd:'load_users'},    
              {account:'required$,object$'}, 
              load_users )

  seneca.add( {role:name, cmd:'suspend'},    
              {account:'required$,object$'}, 
              suspend_account )

  seneca.add( {role:name, cmd:'primary'},    
              {user:'required$,object$', account:'required$,object$'}, 
              primary_account )

  seneca.add( {role:name, cmd:'adduser'},    
              {user:'required$,object$', account:'required$,object$'}, 
              adduser )

  seneca.add( {role:name, cmd:'removeuser'}, 
              {user:'required$,object$', account:'required$,object$'}, 
              removeuser )


  // actions overridden
  seneca.add( {role:'user', cmd:'register' }, user_register )


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
      accountent.load$(accid,cb)

    }, function(err,results){
      if( err ) return done(err);

      var accounts = []
      if( results ) {
        _.each( results, function( accent, i ){
          if( accent ) {
            accounts.push(accent)
          }
          else seneca.log.warn('account-not-found', user.accounts[i], user.id, user);
        })
      }
      done(null,accounts)
    })
  }


  // load the user entities for an account, id array in account.users property
  function loadusers( account, done ) {
    async.mapLimit( account.users||[], options.loadlimit, function(userid,cb){
      userent.load$(userid,cb)

    }, function(err,results){
      if( err ) return done(err);

      var users = []
      if( results ) {
        _.each( results, function( userent, i ){
          if( userent ) {
            users.push(accent)
          }
          else seneca.log.warn('user-not-found', account.users[i], account.id, account);
        })
      }
      done(null,users)
    })
  }


  function account_result( done, log_prefix ) {
    return function( err, account ) {
      if( err ) return done(err);
      this.log.debug.apply( this, log_prefix.concat(account) )
      done(null,{account:account})
    }
  }


  // create a new account
  // name: string, name of account
  // active: boolean, account active if true
  // other args saved as account fields
  // provides: {account:sys/account}
  function create_account( args, done ) {
    var fields = seneca.util.argprops({}, args, {
      active: void 0 == args.active ? true : !!args.active
    }, 'role, cmd')

    var acc = accountent.make$(fields)
    this.log.debug('create',acc)
    acc.save$( done )
  }


  // find account for user, or create one if none exists
  // user: sys/user
  // account: sys/account, optional, returned if present
  // provides: {account:sys/account}
  function resolve_account( args, done ) {
    var user   = args.user
    var account = args.account

    // account was passed in from context
    if( account ) {
      this.log.debug('resolve','arg',user,account)
      return done(null,{account:account})
    }

    // user.account field specified account id
    if( void 0 != user.account ) {
      return accountent.load$( 
        user.account, 
        account_result.call( this, done, ['resolve','field',user] ) )
    }

    // use primary account from list of account ids in user.accounts
    if( user.accounts && 0 < user.accounts.length) {
      return accountent.load$( 
        user.accounts[0], 
        account_result.call( this, done, ['resolve','primary',user] ) )
    }

    // auto create account
    var accname = user.name + options.autoNameSuffix
    return pin.create(
      {name:accname}, 
      account_result.call( this, done, ['resolve','auto-create',user] ) )
  }



  // load accounts for user
  // user: sys/user
  // provides: {accounts:[sys/account]}
  function load_accounts( args, done ) {
    loadaccounts( args.user, function(err,list){
      done(err,err?null:{accounts:list})
    })
  }


  // load users for account
  // account: sys/account
  // provides: {users:[sys/user]}
  function load_users( args, done ) {
    loadusers( args.account, function(err,list){
      done(err,err?null:{users:list})
    })
  }



  // make account inactive
  // account: sys/account
  // provides: {account:sys/account}
  function suspend_account( args, done ) {
    var account = args.account
    account.active = false
    account.save$( account_result.call( this, done, ['suspend'] ) )
  }


  // set user's primary account
  // user: sys/user
  // account: sys/account
  // provides: {user:sys/user, account:sys/account}
  function primary_account( args, done ) {
    var user    = args.user
    var account = args.account

    additem( user,    account, 'accounts' ) 
    additem( account, user,    'users'    ) 

    user.accounts.unshift( account.id )
    user.accounts = _.uniq(user.accounts)

    save( user, account, done ) 
  }



  // add user to account
  // user: sys/user
  // account: sys/account
  // provides: {user:sys/user, account:sys/account}
  function adduser( args, done ) {
    var user    = args.user
    var account = args.account

    additem( user,    account, 'accounts' ) 
    additem( account, user,    'users'    ) 

    save( user, account, done ) 
  }


  // remove user from account
  // user: sys/user
  // account: sys/account
  // provides: {user:sys/user, account:sys/account}
  function removeuser( args, done ) {
    var user    = args.user
    var account = args.account

    user.accounts = user.accounts || []
    user.accounts = _.reject(user.accounts,function(accid){return accid==account.id})

    account.users = account.users || []
    account.users = _.reject(account.users,function(accid){return accid==account.id})

    save( user, account, done ) 
  }



  // override seneca-user, user register action
  function user_register( args, done ) {
    this.prior( args, function( err, out ) {
      if( err ) return done( err );
      if( !out.ok ) return done( null, out )

      var resargs = {user:out.user}
      if( args.account ) resargs.account = args.account;

      pin.resolve(resargs, function( err, result ){
        if( err ) return done( err );
        var account = result.account

        additem( out.user, account, 'accounts' ) 
        additem( account, out.user, 'users' ) 
        delete out.user.account

        save( out.user, account, function( err, res ){
          if( err ) return done( err );
          out.user = res.user
          done( err, out )
        })
      })
    })
  }
  


  // define sys/account entity
  seneca.add({init:name}, function( args, done ){
    seneca.act('role:util, cmd:define_sys_entity', {list:[accountent.canon$()]})
  })


  return {
    name: name
  }
}
