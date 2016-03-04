"use strict";

/*
    Working with oauth2 APIs has its complexities, some of which
    are dealt with by the google client library, but some of which
    are exposed for us to deal with.

    These functions do the majority of the fiddly stuff.  In particular,
    the dn.request_* functions are designed to be used in a promise chain
    within a until_success call. See the readme for additional explanation.

    You can insert the request_screw_up_auth into a promise chain to check 
    how the chain handles unexpected invalidation.

*/

dn.is_auth_error = function(err){
    // returns 0 for non-auth errors, 1 for auto refresh and 2 for manual refresh
    if(!err)
        return 2;
    if(err.type && err.type === "token_refresh_required")
        return 1;
    if(err.status === 403 || err.status === 401)
        return 1;
    if(err.status === 404)
        return 0;
    if(err.result && err.result.error && err.result.code === -1)//network error
        return 1;
    console.log("WHAT IS THIS ERROR?....")
    console.dir(err);
    return 0;
}

dn.handle_auth_error = function(err){
    // this is the error handler for dn.pr_auth

    dn.status.authorization = -1;
    dn.status.popup_active = 0;
    dn.show_status();
    var err_type = dn.is_auth_error(err);

    if(err_type === 0)
        dn.show_error(err.result.error.message);
    else if(err_type == 1)
        dn.reauth_auto();
    else{
        // user has to click button to trigger reauth-manual
        dn.toggle_permission(true);
    }
}


dn.reauth_auto_delay_chain = {0: 1, 1:500, 500: 1000, 1000: 2500, 2500: 5000, 5000: 10000, 10000: 60000, 60000: 60000}
dn.reauth_auto = function(){ 
    // with roughly-exponetial backoff...
    if (!dn.reauth_auto_timer){
        // 1ms, 500ms, 1s, 2s, 5s, 10s, 60s.
        if(!dn.reauth_auto_delay)
            dn.reauth_auto_delay = dn.reauth_auto_delay_chain[0];
        else
            dn.reauth_auto_delay = dn.reauth_auto_delay_chain[dn.reauth_auto_delay];
        dn.status.authorization = 0;
        dn.show_status();
        console.log("issuing auto reauth with delay " + dn.reauth_auto_delay + "ms.")
        dn.reauth_auto_timer = setTimeout(function(){
            dn.reauth_auto_timer = undefined;
            console.log("and now running the auto reauth...")
            gapi.auth.authorize(dn.auth_map(true))
                .then(dn.pr_auth.resolve.bind(dn.pr_auth),
                      dn.pr_auth.reject.bind(dn.pr_auth));
        }, dn.reauth_auto_delay)
    } else {
        console.log("auto reauth already due to be sent")
    }
}

dn.reauth_manual = function(){
    // if this succeeds it will trigger dn.pr_auth.resolve, which will call 
    // any pending (and future) success callbacks.
    dn.status.popup_active = 1;
    dn.status.authorization = 0;
    dn.show_status();    
    gapi.auth.authorize(dn.auth_map(false))
        .then(dn.pr_auth.resolve.bind(dn.pr_auth),
              dn.pr_auth.reject.bind(dn.pr_auth));
}

dn.request_user_info = function(){
    // returns thenable
    return gapi.client.request({'path' : 'userinfo/v2/me?fields=name'})
}

dn.request_file_meta = function(){
    // returns thenable
    dn.status.file_meta = 0;
    dn.show_status();
    return gapi.client.request({
        'path': '/drive/v3/files/' + dn.the_file.file_id,
        'params':{'fields': 'name,mimeType,description,parents,capabilities,fileExtension,shared'}});
}

dn.request_file_body = function(){
    // returns thenable
    dn.status.file_body = 0;
    dn.show_status();
    return gapi.client.request({
        'path': '/drive/v3/files/' + dn.the_file.file_id,
        'params':{'alt': 'media'}});
}

dn.request_app_data_document = function(){
    return new Promise(function(succ, fail){

        // we want one error handler for loading, and one for subsequent errors, but the API doesn't
        // distinguish between the two, so it's up to us to do so....
        dn.app_data_realtime_error = function(err){
            if(dn.status.realtime_settings < 1){
                fail(err);
            }else{
                if(err.type === "token_refresh_required"){
                    dn.pr_auth.reject(err);
                } else {
                    console.dir(err);
                    dn.show_error("" + err);
                }
            }
        }

        gapi.drive.realtime.loadAppDataDocument(succ, null, dn.app_data_realtime_error);
        // the null argument is an omptional function for handling the initialization
        // the first time the document is loaded;
    });
}


//*
dn.request_screw_up_auth_counter = 0;
dn.request_screw_up_auth = function(){
    if(++dn.request_screw_up_auth_counter < 10){
        console.log("INVALIDATING TOKEN")
        gapi.auth.setToken("this_is_no_longer_valid");
    }
    return true;
}
//*/