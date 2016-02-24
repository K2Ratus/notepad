"use strict";

Worker = (function(){  
    var nativeWorker = Worker;

    // This class (fully?) wraps the native Worker
    // but the advantage is that it can be returend immediately while we asynchrounously
    // download the worker code from another location and put it into a blob.
    // Once the true worker is ready we apply any queued function calls
    var BlobWorker = function(){
        this.queuedCallList = [];
        this.trueWorker = null;
        this.onmessage = null;
    }
    BlobWorker.prototype.postMessage = function(){
        if(this.trueWorker)
            this.trueWorker.postMessage.apply(this.trueWorker,arguments);
        else
            this.queuedCallList.push(['postMessage',arguments]);
    };
    BlobWorker.prototype.terminate = function(){      
        if(this.trueWorker)
            this.trueWorker.terminate();
        else
            this.queuedCallList.push(['terminate',arguments]);
    }

    BlobWorker.prototype.FileDataReceived = function(script){
        this.trueWorker = new nativeWorker(window.URL.createObjectURL(new Blob([script],{type:'text/javascript'})));
        if(this.onmessage)
            this.trueWorker.onmessage = this.onmessage;

        while(this.queuedCallList.length){
            var c = this.queuedCallList.shift();
            this.trueWorker[c[0]].apply(this.trueWorker,c[1]);
        }
    }

    return function(url){
        var w = new BlobWorker();
        $.ajax(url,{
                crossDomain: true,//because of the base tag in the page head jquery thinks this is same origin, but really it is cors.  this helps.
                success: $.proxy(w.FileDataReceived,w),
                error: function(s,err){throw err},
                dataType:"text"});
        return w;
    };
})();