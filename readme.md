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