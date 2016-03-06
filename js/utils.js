"use strict";

var oxford_comma = function(arr){
    switch (arr.length){
        case 1:
            return arr[0];
        case 2:
            return arr[0] + " and " + arr[1];
        case 3:
            return arr[0] + ", " + arr[1] + ", and " + arr[2];
    }
}

var rotate = function(el, deg){
    el.style.transform = "rotate(" + deg + 'deg)';
    el.style.webkitTansform = "rotate(" + deg + 'deg)';
    el.style.mozTransform = "rotate(" + deg + 'deg)';
}

var translate = function(el, x, y){
    var str = x==null ? "" : "translate(" + x + "px," + y + "px)";
    el.style.transform = str;
    el.style.webkitTransform = str;
    el.style.mozTransform = str;
}

var text_multi = function(el, text, truncate_long_words){
    if(truncate_long_words){
        text = text.replace(/(\S{25})\S*/g,'$1...'); 
    }
    el.textContent = text;  
    el.innerHTML = el.innerHTML.replace(/\n/g,'<br/>').replace(/\t/g,'&nbsp;&nbsp;&nbsp; ');
}

var escape_str = function(str){
    // http://stackoverflow.com/a/18750001/2399799
    return str.replace(/[\u00A0-\u9999<>\&]/g, function(i) {
        return '&#' + i.charCodeAt(0) + ';';
    });
}

var css_animation = (function(){
    var timers = []; // we store timers and matching els so we can cancel if needed
    var els = [];

    return function(el, cls, callback, delay){
        el.classList.remove(cls);
        el.offsetTop; //forces class to be removed, so we can actually re-add it.
        var old_idx = els.indexOf(el);
        if(old_idx != -1){
            clearTimeout(timers[old_idx]);
            timers.splice(old_idx, 1);
            els.splice(old_idx, 1);
        }
        els.push(el);
        timers.push(setTimeout(callback, delay)); //this is better than trying to use the endtransition event
        el.classList.add(cls);
    }
})();

var stop_propagation = function(e){
    e.stopPropagation();
}

var prevent_default = function(e){
    e.preventDefault();  
}

var prevent_default_and_stop_propagation = function(e){
    e.stopPropagation();
    e.preventDefault();
}

var until_success = function(executor){
    /* This was confusing to write, so when I finished I turned it into an S.O. answer:
          http://stackoverflow.com/a/35782428/2399799  
       An explanation and proper example is given there.*/
    
    var before_retry = undefined;
    var outer_executor = function(succeed, reject){
        var rejection_handler = function(err){
            if(before_retry){
                try {
                    var pre_retry_result = before_retry(err);
                    if(pre_retry_result)
                        return succeed(pre_retry_result);
                } catch (pre_retry_error){
                    return reject(pre_retry_error);
                }
            }
            return new Promise(executor).then(succeed, rejection_handler);                
        }
        return new Promise(executor).then(succeed, rejection_handler);
    }

    var outer_promise = new Promise(outer_executor);
    outer_promise.before_retry = function(func){
        before_retry = func;
        return outer_promise;
    }
    return outer_promise;
}




/* TODO: ...............................................................

$.fn.fixHeightFromAuto = function(){
    var heights = [];
    var d = this.get();
    for(var i=0;i<d.length;i++)
        heights.push(getComputedStyle(d[i]).height);
    
    this.each(function(ind){this.style.height = heights[ind];});

    return this;
}

$.fn.insertClonedChildren = function(index,$src,textArray,attrObjArrays){
    //inserts new nodes before this.children(index)
    //the new nodes are based on $src, with text set according to the elements of textArray
    //attrObjArrays is an optional arrays of objects giving key names and values
    
    var src = $src.get(0);
    var frag = document.createDocumentFragment();
    
    textArray.map(function(str,ind){
                    var a = src.cloneNode(false); 
                    a.textContent = str;
                    if(attrObjArrays)for(var attr in attrObjArrays[ind])
                        a.setAttribute(attr,attrObjArrays[ind][attr]);
                    frag.appendChild(a);
                });
    
    var parent = this.get(0);
    var new_$els = $(Array.prototype.slice.call(frag.children,0));
    parent.insertBefore(frag,parent.children[index]);
    
    return new_$els;
}

*/