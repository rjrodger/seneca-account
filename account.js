/* Copyright (c) 2013 Richard Rodger, MIT License */
"use strict";


var _     = require('underscore')
var async = require('async')



module.exports = function( options ) {
  var seneca = this
  var plugin   = 'account'

  seneca.depends(plugin,[
    'user' // overrides some actions
  ])


  options = seneca.util.deepextend({
    loadlimit:3,
    autoNameSuffix:' Account',
    prefix: '/account',
    web:true
  },options)
  

  if( options.web ) {
    seneca.depends(plugin,[
      'auth' // overrides some actions
    ])
  }


  var accountent = seneca.make$( 'sys/account' )
  var userent    = seneca.make$( 'sys/user' )


  // actions provided
  seneca.add( {role:plugin, cmd:'create',
               name:{required$:true,string$:true}}, 
              create_account )

  seneca.add( {role:plugin, cmd:'resolve',
               user:{required$:true,object$:true}, account:{object$:true}}, 
              resolve_account )

  seneca.add( {role:plugin, cmd:'load_accounts',
               user:{required$:true,object$:true}}, 
              load_accounts )

  seneca.add( {role:plugin, cmd:'load_users',
               account:{required$:true,object$:true}}, 
              load_users )

  seneca.add( {role:plugin, cmd:'suspend',
               account:{required$:true,object$:true}}, 
              suspend_account )

  seneca.add( {role:plugin, cmd:'primary',
               user:{required$:true,object$:true}, account:{required$:true,object$:true}}, 
              primary_account )

  seneca.add( {role:plugin, cmd:'add_user',
               user:{required$:true,object$:true}, account:{required$:true,object$:true}}, 
              add_user )

  seneca.add( {role:plugin, cmd:'remove_user',
               user:{required$:true,object$:true}, account:{required$:true,object$:true}}, 
              remove_user )

  seneca.add( {role:plugin, cmd:'update',
               account:{required$:true,object$:true}},
              update_account )

  seneca.add( {role:plugin, cmd:'clean',
               account:{required$:true,object$:true}}, 
              clean_account )


  // actions overridden
  seneca.add( {role:'user', cmd:'register' }, user_register )

  if( options.web ) {
    seneca.add( {role:'auth', cmd:'instance' }, auth_instance )
  }


  // resolve entity args by id
  seneca.act({
    role:   'util',
    cmd:    'ensure_entity',
    pin:    { role:plugin, cmd:'*' },
    entmap: {
      account: accountent,
      user:    userent,
    }
  })

  
  var pin = seneca.pin({ role:plugin, cmd:'*' })


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

        done(null,{ok:true,user:user,account:account})
      })
    })
  }


  // load the account entities for a user, id array in user.accounts property
  function load_accounts_for_user( user, done ) {
    if( !user ) return done(null,[]);

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
  function load_users_for_account( account, done ) {
    async.mapLimit( account.users||[], options.loadlimit, function(userid,cb){
      userent.load$(userid,cb)

    }, function(err,results){
      if( err ) return done(err);

      var users = []
      if( results ) {
        _.each( results, function( userent, i ){
          if( userent ) {
            users.push(userent)
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
      done(null,{ok:!!account,account:account})
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
    acc.save$( function(err, acc) {
      if(err) return done(err);

      done( null, {ok:!!acc,account:acc} )
    })
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
      return done(null,{ok:true,account:account})
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
    var accname = !_.isEmpty(options.autoNameSuffix) ? user.name + options.autoNameSuffix : ''
    return pin.create(
      {name:accname,orignick:user.nick,origuser:user.id}, 
      function( err, out ) {
        account_result.call( this, done, ['resolve','auto-create',user] ).call(this,err,out.account)
      })
  }



  // load accounts for user
  // user: sys/user
  // provides: {accounts:[sys/account]}
  function load_accounts( args, done ) {
    load_accounts_for_user( args.user, function(err,list){
      done(err,err?null:{ok:true,accounts:list})
    })
  }


  // load users for account
  // account: sys/account
  // provides: {users:[sys/user]}
  function load_users( args, done ) {
    load_users_for_account( args.account, function(err,list){
      done(err,err?null:{ok:true,users:list})
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
  function add_user( args, done ) {
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
  function remove_user( args, done ) {
    var user    = args.user
    var account = args.account

    user.accounts = user.accounts || []
    user.accounts = _.reject(user.accounts,function(accid){return accid==account.id})

    account.users = account.users || []
    account.users = _.reject(account.users,function(accid){return accid==account.id})

    save( user, account, done ) 
  }



  // update existing account
  // args saved as account fields
  // provides: {account:sys/account}
  function update_account( args, done ) {
    var acc = args.account

    var fields = seneca.util.argprops({}, args, {}, 'role, cmd, user, account')
    acc.data$( fields )

    this.log.debug('update',acc)

    acc.save$( account_result.call( this, done, ['update'] ) )
  }



  // clean account entity
  function clean_account( args, done ) {
    var acc = _.clone( seneca.util.clean( args.account.data$() ) )
    delete acc.users
    delete acc.active
    delete acc.origuser
    delete acc.orignick
    done( null, {account:acc})
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
  

  // override seneca-auth, instance action
  function auth_instance( args, done ) {
    this.prior( args, function( err, out ) {
      load_accounts_for_user( args.user, function( err, accounts ){
        if(err) return done(err);

        async.mapLimit( 
          accounts, 
          options.loadlimit,
          function( acc, next ) {
            seneca.act({role:plugin,cmd:'clean',account:acc}, next )
          },
          function( err, list ) {
            if( err ) return done( err );
            accounts = _.map( list, function(entry){ return entry.account })
          })

          
        if( args.all_accounts ) {
          out.accounts = accounts
        }
        else {
          out.account = accounts[0]
        }

        out.ok = true

        done( null, out )
      })
    })
  }


  function buildcontext( req, res, args, act, respond ) {
    var user = req.seneca && req.seneca.user
    if( user ) {
      args.user = user
    }

    if( void 0 == args.account ) {
      if( user && user.accounts && 0 < user.accounts.length) {
        args.account = user.accounts[0]
      }
    }

    act(args,respond)
  }



  // web interface
  seneca.act_if(options.web, {role:'web', use:{
    prefix:options.prefix,
    pin:{role:plugin,cmd:'*'},
    map:{
      update: { POST:buildcontext }
    }
  }})




  // define sys/account entity
  seneca.add({init:plugin}, function( args, done ){
    seneca.act('role:util, cmd:define_sys_entity', {list:[accountent.canon$()]})
    done()
  })


  return {
    name: plugin
  }
}
