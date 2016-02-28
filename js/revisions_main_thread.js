"use strict";

dn.close_history = function(){
    dn.file_history.$revisions_display.remove();
    window.removeEventListener("resize", dn.revisions_window_resize);
    document.getElementById('the_editor').style.display = '';
    dn.editor.resize();
    dn.is_showing_history = false;
}
dn.revisions_window_resize = function(){
    if(dn.file_history.canShowResizeError){
        dn.show_error("The history explorer displays poorly if you resize the window while it is open. (This is a bug.)");
        dn.file_history.canShowResizeError = false; //wait at least ERROR_DELAY_MS until displaying the error again
        setTimeout(function(){dn.file_history.canShowResizeError = true;},dn.error_delay_ms);
    }    
}

dn.start_revisions_worker = function(){
    if(dn.the_file.is_brand_new){
        dn.show_error("This is a new file.  It doesn't have any history to explore.")
        return;
    }
    dn.is_showing_history = true;
    
    if(!dn.file_history){
        dn.el.widget_content.innerHTML('afterend', 
            "<div class='widget_box widget_revisions'>" + 
            "<div class='widget_box_title widget_revisions_title'>File History</div>" +
            "<div class='revision_caption_at'></div>" +
            "<div class='revision_timeline'></div>" +
            "<div class='revision_caption_from'></div>" +
            "<div>Removed lines: <div class='button inline_button ' id='expand_removed'>expand</div>" + 
                    "<div class='button inline_button ' id='collapse_removed'>collapse</div></div>" +
            "<br><div class='widget_divider'></div>" + 
            "<div id='revisions_status'>Initialising...</div>" + 
            "Press Esc to return to editing." +
            "<br><div class='widget_divider'></div>" + 
            "Please note that the history viewing tool is missing some important features and those that have been implemented may include the odd bug.</div>");
        dn.el.widget_file_history = dn.el.widget_content.parentNode.getElementsByClassName('widget_revisions')[0];
        dn.el.widget_file_history.style.display = 'none';
        dn.file_history = {
            $revisions_display: $("<div class='revisions_view'><ol></ol></div>"),
            $view: null, 
            $new_li: $("<li class='rev_line' v='-1'/>"),
            $new_tick:  $("<div class='revision_tick'/>"),
            needToRefindViewChildren: false, //this flag tracks when the $rev_lines_ is out of date relative to children of $view
            $rev_lines_: [], // this is a single jQuery collection
            needToFixHeights: $([]),            
            $timeline: $d.find('.revision_timeline'),
            $revisions_status: $d.find('#revisions_status'),
            $revision_caption_from: $d.find('.revision_caption_from'),
            $revision_caption_at: $d.find('.revision_caption_at'),
            $expand_removed: $d.find('#expand_removed'),
            $collapse_removed: $d.find('#collapse_removed'),
            revisions: [], //array of objects with etag, isDownloaded, modifiedDate, $tick
            revisionFromEtag: {},
            at: null, //revision object
            from: null, //revision object,
            canShowResizeError: true, //used by Revisions_WindowResize
            worker: new Worker("js/revisions_worker.js")
        };
    
        dn.file_history.$view = dn.file_history.$revisions_display.find('ol'); 
        dn.file_history.$expand_removed.addEventListener('click', function(){dn.g_settings.set('historyRemovedIsExpanded',true)});
        dn.file_history.$collapse_removed.addEventListener('click', function(){dn.g_settings.set('historyRemovedIsExpanded',false)});
        dn.revision_setis_expaned(dn.g_settings.get('historyRemovedIsExpanded'))

        var w = dn.file_history.worker;
        w.onmessage = dn.revision_worker_delivery;
    }
    dn.file_history.worker.postMessage({ fileId: dn.the_file.file_id, 
                                        token: gapi.auth.getToken().access_token,
                                        init: true});
    dn.file_history.$revisions_display.appendTo($('body'));
    $(window).on("resize",dn.revisions_window_resize);
    dn.el.widget_file_history.style.display = '';
    dn.file_history.$view.empty();
    $('#the_editor').style.display = 'none';
    return false;
}

dn.revision_setis_expaned = function(v){
    var h = dn.file_history;
    if(!h) return; //if we haven't yet initialised fileHistory stuff then ignore this for now, when we do initialise we will read and apply the g_settings value
    
    if(v){
        h.$expand_removed.classList.add('selected')
        h.$collapse_removed.classList.remove('selected');
        h.$view.setAttribute("removed","expanded");
    }else{
        h.$collapse_removed.classList.add('selected')
        h.$expand_removed.classList.remove('selected');
        h.$view.setAttribute("removed","collapsed")
    }
}
dn.revision_set_at = function(r,fromChangeEvent,fromTimelineCreation){
    var h = dn.file_history;
    h.at = r;
    if(!fromChangeEvent)
        h.$at_range.value = r.ind;    
    text_multi(h.$revision_caption_at,
            r.modifiedDate.toLocaleDateString({},{month:"short",day:"numeric",year: "numeric"}) + "\n" +
            r.modifiedDate.toLocaleTimeString({},{hour: "numeric",minute: "numeric"})
        )
    
    if(h.from && !fromTimelineCreation)
        h.worker.postMessage({showEtag: h.at.etag,
                      fromEtag: h.from.etag  });
}

dn.revision_set_from = function(r,fromChangeEvent,fromTimelineCreation){
    var h = dn.file_history;
    h.from = r;
    if(!fromChangeEvent)
        h.$from_range.value = r.ind;
    text_multi(h.$revision_caption_from,
            r.modifiedDate.toLocaleDateString({},{month:"short",day:"numeric",year: "numeric"}) + "\n" +
            r.modifiedDate.toLocaleTimeString({},{hour: "numeric",minute: "numeric"})
        )
    
    if(h.at && !fromTimelineCreation)
        h.worker.postMessage({showEtag: h.at.etag,
                          fromEtag: h.from.etag  });
}

dn.display_revision_timeline = function(newRevisions){
    var h = dn.file_history;
    var rs = h.revisions;
    //TODO: update display based on newRevisions rather than starting from scratch
    
    h.$at_range = $("<input class='revision_at_range' type='range' min='0' max='" + (rs.length-1) + "'/>");
    h.$tick_box = $("<div class='revision_tick_box'/>");
    h.$from_range = $("<input class='revision_from_range' type='range' min='0' max='" + (rs.length-1) + "'/>");
    
        
    var attr = rs.map(function(t){ return { downloaded: t.isDownloaded || false }; });
    var text = Array.apply(null, Array(attr.length)).map(function () { return "" });
    var $ticks = h.$tick_box.insertClonedChildren(0,h.$new_tick,text,attr);
    
    for(var i=0;i<rs.length;i++){
        rs[i].ind = i;
        rs[i].$ = $ticks.eq(i);
    }
    
    h.$timeline.empty().append(h.$at_range).append(h.$tick_box).append(h.$from_range);

    h.$at_range.on("change",function(){
            dn.revision_set_at(dn.file_history.revisions[this.value],true);
        })
    h.$from_range.on("change",function(){
            dn.revision_set_from(dn.file_history.revisions[this.value],true);
        })

    dn.revision_set_from(rs.length > 1 ? rs[1] : rs[0],false,true);
    dn.revision_set_at(rs[0],false,true);
}

dn.revision_worker_delivery = function(e){
    if(!e.data)
        return; //not sure if this is possible

    if(e.data.debug)
        console.log(e.data);
        
    var h = dn.file_history;
    //TODO: probably ought to use a more sensivle message system with a string command switching thign...but this is ok for now
    
    if(e.data.status)
        text_multi(h.$revisions_status, e.data.status);
        
    if(e.data.revisions){    
        h.revisions = e.data.revisions;
        e.data.revisions.forEach(function(r){ h.revisionFromEtag[r.etag] = r;});
        dn.display_revision_timeline(e.data.revisions);
        h.worker.postMessage({ showEtag: h.at.etag,
                               fromEtag: h.from.etag }); 
    }
    
    if(e.data.revisionDownloaded){
        var r = h.revisionFromEtag[e.data.revisionDownloaded];
        r.$.attr('downloaded',true);
        r.isDownloaded = true;
    }
    
    if(e.data.revsionDiffed){
        h.needToRefindViewChildren = true;
        var r = h.revisionFromEtag[e.data.revsionDiffed];
        r.$.attr('diffed',true);
        r.isDiffed = true;
        
        var newStuff = e.data.newStuffForDom;
        for(var i=0;i<newStuff.length;i++){
            var lines = newStuff[i].lines.map(function(str){return str || " "});  
                                            // "|| space" thing is a hack for auto height stuff
            h.needToFixHeights = h.needToFixHeights.add(
                            h.$view.insertClonedChildren(newStuff[i].at,h.$new_li,lines)    );            
        }
    }

    
    if(e.data.vals_ui8buffer){
        
        if(h.needToRefindViewChildren){
            h.$rev_lines_ = h.$view.children();
            h.needToRefindViewChildren = false;
        }
        var $rl_ = h.$rev_lines_;
        
        if(h.needToFixHeights.length){
            text_multi(h.$revisions_status, "Obtaining line height data...");
            h.needToFixHeights.fixHeightFromAuto();
            h.needToFixHeights = $([]);
            text_multi(h.$revisions_status, "Selecting lines...");
        }
        
        var vals = new Uint8Array(e.data.vals_ui8buffer)
        $rl_.setAttribute('v',function(i){return vals[i]});
            
        // We have to manually set the width of the numbers (our version of ace's gutter)
        switch(e.data.digits){
            case 0:
            case 1:
            case 2:
                h.$view.setAttribute('digits','');
                break;
            case 3:
                h.$view.setAttribute('digits','###');
                break;
            case 4:
                h.$view.setAttribute('digits','####');
                break;
            default:
                h.$view.setAttribute('digits','#####');
        }
    }
    
        
}
