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
        timers.push(setTimeout(callback,delay)); //this is better than trying to use the endtransition event
        el.classList.add(cls);
    }
})();


// TODO: ...............................................................

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
