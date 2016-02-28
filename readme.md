# Drive Notepad

A webapp for editing text files in Google Drive, implemented entirely on the client-side.  Running [live on github](https://d1manson.github.io/drivenotepad/app.build.html).

### Development

If, for some reason, you decide to fork this and try and make it work you will need to register various things in the Google Developer Dashboard.   [TODO: document that.] 
Other than that, the only thing you need is [`node`](https://nodejs.org/en/), you can then build with the command `npm run build`.

See the [Google api-explorer](https://developers.google.com/apis-explorer) for details of RESTful APIs.

Icons are from [modernuiicons.com](http://modernuiicons.com), then cropped with [this online tool](http://resizeimage.net), and base64 encoded for css with [this other online tool](http://websemantics.co.uk/online_tools/image_to_data_uri_convertor).

I use `python -m SimpleHTTPServer` for serving content, but you can do as you wish.
