 Drive Notepad

A webapp for editing text files in Google Drive, implemented entirely on the client-side.  Running [live on github](https://drivenotepad.github.io/app/).

### Notes on developing

If, for some reason, you decide to fork this and try and make it work you will need to register various things in the Google Developer Dashboard.
Other than that, the only thing you need is [`node`](https://nodejs.org/en/), you can then build with the command `npm run build`.

See the [Google api-explorer](https://developers.google.com/apis-explorer) for details of RESTful APIs.

Icons are from [modernuiicons.com](http://modernuiicons.com), then cropped with [this online tool](http://resizeimage.net), and base64 encoded for css with [this other online tool](http://websemantics.co.uk/online_tools/image_to_data_uri_convertor).

I use `python -m SimpleHTTPServer` for serving content, but you can do as you wish.

In the Google Develeoper Console you need [create OAuth2 2.0 client credentials](https://console.developers.google.com/apis/credentials) and [enable some APIs](https://console.developers.google.com/apis/enabled) - Drive API, Drive SDK, and Google Picker API.

All the interesting cloud-based stuff goes through the google javascript client library, which lives in the global `gapi`.  In most cases there are two ways to use a particular API: you can either `load` a specific API's javascript methods and make use of them; or you can use the generic `request` method, which helps you "manually" constructing the RESTful request.  We use the manual approach for reading and writing files, but the `load` approach for realtime stuff and picker, and sharer dialogs.

Most of the custom interactivity of the application takes palce within the widget and roughly sticks to an MVC framework, with the model maintained by the realtime `AppDataDocument` from the Google Drive Realtime API. Prior to the realtime document loading, a simplified stand-in is used that has (hopefully) the same behaviour as the full API, minus the cloud-iness, but with the addition of localStorage for impersonal settings.

Occasionally chrome mistakenly caches source maps. If that happens, the easiest thing to do is go into the minified js file and add a query string to the source map url (which is specified in a special comment at the end).  Normally you won't need to do this, but it's annoying when it does happen.


### Introduction

When the page is loaded we either (try and) create a new document, or (try and) load an existing file.  Only one file can ever be loaded, if you need to load/create a new file you have to refresh the page.  This makes life a little simpler.


### Making async API requests

I have tried to wrap most requests in ES6 `Promises`, or variations on that.  An important promise-like object is `dn.pr_auth`, this is a `SpecialPromise` isntance, which can be `resolved` and `rejected` multiple times. As with regular promises, whenever it is resolved the callbacks registered with `.then(success)` are triggered, with each being triggered exactly once, even if `dn.pr_auth` is resolved multiple times.  And, as with regular promises, if `dn.pr_auth` has already been resolved at the moment that the `.then(success)` is registered, it will be triggered immediately.  Finally, the `dn.pr_auth` has two special event listeners: `on_error` and `on_success`, these are called every time the authentication process fails or is successful (respectively).

This behaviour allows us to have actions that wait on the auth token being valid, but if an auth error occurs at a later date we can set the promise to invalid and begin the re-authentication process.  Any actions added after the failure point will await the resolution of the new promise. [The implementation could possibly have been written in terms of ES6 `Promises` rather than raw JS, but the JS implementation is fairly simple so has its merrits.]

As alluded to in the previous paragraphs, these API calls can fail due to sudden invalidation of the auth token.  When that happens we want to re-authenticate and then re-run any pending API calls.  This is quite a complex pattern, so it was wrapped into a utilty function, named `until_success`, and then posted as a [SO answer](http://stackoverflow.com/a/35782428/2399799) to a related question.  Here is an example of how it is used in this app:

```javascript
until_success(function(succ, fail){
    Promise.resolve(dn.pr_auth)
           .then(dn.request_user_info)
           .then(dn.show_user_info)
           .then(succ, fail);
}, dn.pr_auth.reject.bind(dn.pr_auth))
.then(function(){
    console.log('succeeded getting user info.')
})
```

In this code, `dn.show_user_info` is called once the API request on the line above succeeds, which in turn is only called when the auth token is available. If the auth token becomes available but is then mysteriously invalidated, the API request will be made and will fail.  This will cause that "iteration" of the `until_success` `Promise` to fail, invoking `dn.pr_auth.reject`, which calls its `on_error` handler, which in turn *may* issue a new authentication request - see discussion in next paragraph.  In the meantime, `until_sucess` will have begun the next "iteration", and will have "stalled", waiting for the authentication to resolve.  As soon as the authentication is available again the request will be reissued.  This looping will continue until the request suceeds.

There are several ways the task can fail, it could be that the user needs to manually log in, or it could be the token has become invalid somehow and needs to be refreshed, or it could be some other "legitimate" error, such as the request being stupid.  Since the `until_success` will not resolve until success is delivered, you must "rebrand" all possible "legitimate" errors as a success, you do this by inserting the following into the promise chain:

 ```javascript
 .catch(function(err){
 	if(dn.is_auth_error(err)) throw err;
 	return "that's a dumb request you made"; // this is now treated as success 
 })
```

If non-auth errors are not caught, then the `dn.pr_auth.on_error` will display the error to the user and not attempt any reauthentication.  This means the `until_succes` will stall indefinitely, waiting in vain for `dn.pr_auth` to resolve.  To guard against the possibility of issuing excessive numbers of automatic reauth requests there is an roughly exponential backoff process, which in the limit will only issue a request once per minute.  Note however that this backoff is specific to the automatic reauthentication, not to requests in general.

Another important `Pomise`-like thing is `dn.pr_file_loaded`, this simply gets resolved soon after the page loads, when either an existing file is loaded or a new file is created.  If neither of those things ever succeed then this is never settled.  The fact that this is a promise, allows us to put it in the save chain, and th e user can then actually issue save requests before the file is loaded, which is vaugely helpful when creating new files.

### Model-View-Controllers

There are (at least) two separate MVC systems at play in the app, one for the file's metadata and one for the application's setttings.

`dn.the_file` is an instance of `dn.FileModel`, and `dn.file_pane` is a module/closure thing which implements a view and controller for this model.  There are also a few view hooks in the main `app.js`, e.g. setting the title on the document, and applying syntax choice to the editor etc.  For simplicity, saving (of metadata) is handled by the controllers in `dn.file_pane`, it's just easier to tie the saving action to user actions rather than arbitrary updates on the model.

`dn.g_settings` is a Google Realtime API `Model`, or a very simple mock that behaves enough like it to do what we need.
