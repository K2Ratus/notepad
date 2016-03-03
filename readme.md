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

In this code, `dn.show_user_info` is called once the API request on the line above succeeds, which in turn is only called when the auth token is available. If the auth token becomes available but is then mysteriously invalidated, the API request will be made and will fail.  This will cause that "iteration" of the `until_success` `Promise` to fail, invoking `dn.pr_auth.reject`, which calls its `on_error` handler, which in turn will issue a new authentication request.  In the meantime, `until_sucess` will have begun the next "iteration", and will have "stalled", waiting for the authentication to resolve.  As soon as the authentication is available again the request will be reissued.  This looping will continue until the request suceeds. 