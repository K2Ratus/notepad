"use strict";

dn.history_tool = (function(){

var el = {};

var revision_meta = []; // we clear this each time we call refresh_revisions_list
var worker_has_revision = {}; // we cache revision bodies on the worker, recording true here when we do using revision id as the key

var worker;

var start = function(){
    // TODO: add current state to revisions meta and body

    if(worker === undefined){
        worker = new Worker("js/history_tool_worker.js");
        worker.onmessage = on_worker_message;
    }

    dn.el.editor.style.display = 'none';
    el.revisions_view.style.display = '';
    refresh_revisions_list();
}

var end = function(){
    dn.el.editor.style.display = '';
    el.revisions_view.style.display = 'none';
    el.ordered_list.innerHTML = "";
}

var on_worker_message = function(e){
    if(e.data.diffed_revision){
        if(e.data.diffed_revision.id === "current"){
            var lines = e.data.diffed_revision.lines;
            for(var kk=0; kk<lines.length; kk++){
                var it = document.createElement('li');
                it.classList.add('rev_line');
                it.textContent = lines[kk];
                el.ordered_list.appendChild(it);
            }
        }else {
            for(var ii=0; ii<revision_meta.length; ii++) if(revision_meta[ii].id == e.data.diffed_revision.id){
                revision_meta[ii].el_tick.classList.add('diffed');
                var sections = e.data.diffed_revision.sections;
                for(var jj=0; jj<sections.length; jj++){
                    var lines = sections[jj].lines;
                    var el_before = el.ordered_list.children[sections[jj].at];
                    for(var kk=0; kk<lines.length; kk++){
                        var it = document.createElement('li');
                        it.textContent = lines[kk];
                        it.classList.add('rev_line');
                        el.ordered_list.insertBefore(it, el_before.nextSibling);
                        el_before = it;
                    }
                }
                
                break;
            }            
        }
    }


}


var append_tick = function(){
    var el_tick = document.createElement('div');
    el_tick.classList.add('revision_tick');
    el.tick_box.appendChild(el_tick);
    return el_tick;
}

var send_revisions_order_to_worker = function(resp){
    // TODO: show some kind of status update, to make it clear we have got the list and downloading X or Y total revisions
    var r_to_get = [], id_order = [];
    revision_meta = revision_meta.concat(resp.result.revisions.reverse()); // the first element was just {id: "current"}
    el.at_range.max = revision_meta.length - 1;
    el.from_range.max = revision_meta.length - 1;

    for(var ii=1; ii<revision_meta.length; ii++){
        id_order.push(revision_meta[ii].id);
        revision_meta[ii].el_tick = append_tick();
        if(!worker_has_revision.hasOwnProperty(revision_meta[ii].id)){
            r_to_get.push(revision_meta[ii])    
        }else{
            revision_meta[ii].el_tick.classList.add('downloaded');
        }
    }

    worker.postMessage({use_order: id_order});
    revision_meta[0].el_tick.classList.add('diffed'); // this is a bit of a hack - if we had rendered it as being diffed before we knew the lenght of the list it would look wrong
    render_download_status();
    render_for_settings();
    return r_to_get;

}

var send_revision_body_to_worker = function(revision_meta){
    return function(resp){
        if(resp.status !== 200)
            throw resp;
        worker.postMessage({revision: {
            id: revision_meta.id,
            body: resp.body}});
        worker_has_revision[revision_meta.id] = true;
        revision_meta.el_tick.classList.add('downloaded');
        render_download_status();
        return true;
    }
}

var render_download_status = function(){
    var n_pending = 0;
    for(var ii=0;ii<revision_meta.length; ii++)
        if(!worker_has_revision.hasOwnProperty(revision_meta[ii].id))
            n_pending++;

    if(n_pending){
        el.info.textContent = "Downloaded " + (revision_meta.length - n_pending) 
                                        + " of " + revision_meta.length + "...";
    }else{
        el.info.textContent = "Downloaded all revisions.";
    }

}

var refresh_revisions_list = function(){
    // TODO: make this cancelable, with race
    el.info.textContent = "Updating revision list...";
    el.tick_box.innerHTML = "";
    el.at_range.max = 1;
    el.from_range.max = 1;
    el.at_range.value = 0;
    el.from_range.value = 0;
    revision_meta = [{id: 'current',
                      el_tick: append_tick()}];
    worker.postMessage({reset_with_current_body: dn.editor.getSession().getValue()});
    worker_has_revision['current'] = true;
    revision_meta[0].el_tick.classList.add('downloaded');
    render_for_settings();

    // update the list of revisions, and prepare a list of ids to get bodies for
    until_success(function(succ, fail){
        Promise.all([dn.pr_auth, dn.pr_file_loaded])
               .then(dn.request_revision_list)
               .then(send_revisions_order_to_worker)
               .then(succ, fail);
    }).before_retry(dn.filter_api_errors)
    .catch(function(err){
        console.log("failed to update revisions list")
        dn.show_error(dn.api_error_to_string(err));
        throw(err);
    }).then(function(r_to_get){
        // download all the requested bodies...
        // note that annoyingly you cant use gapi batch-ing to do this
        var body_promises = []
        for(var ii=0; ii<r_to_get.length; ii++){
            body_promises.push(
                 until_success(function(succ, fail){
                            Promise.resolve(dn.pr_auth)
                                   .then(dn.request_revision_body(r_to_get[ii].id))
                                   .then(send_revision_body_to_worker(r_to_get[ii]))
                                   .then(succ, fail);
                        }).before_retry(dn.filter_api_errors)
                        .catch(function(err){
                            console.log("failed to download revision body")
                            dn.show_error(dn.api_error_to_string(err));
                            throw(err);
                        })
            ); // push    
        } // loop

        return Promise.all(body_promises)
           .then(function(res){
                console.log("got all bodies!!");
           }).catch(function(err){
                console.log("failed to get all bodies")
           });
    });


 
}


var render_for_settings = function(){
    if(!dn.pr_file_loaded.is_resolved()) return;

    var at_meta = revision_meta[el.at_range.value];
    var from_meta = revision_meta[el.from_range.value];

    if(at_meta.id === "current"){
        text_multi(el.caption_at, "Current\ndocument");
    } else {
        var at_time = new Date(Date.parse(at_meta.modifiedTime));
        text_multi(el.caption_at, at_time.toLocaleDateString({}, {month:"short", day:"numeric", year: "numeric"}) + "\n" +
                                  at_time.toLocaleTimeString({}, {hour: "numeric", minute: "numeric"}));
    } 

    if(from_meta.id === "current"){
        text_multi(el.caption_from, "Current\ndocument");
    } else {
        var from_time = new Date(Date.parse(from_meta.modifiedTime));
        text_multi(el.caption_from, from_time.toLocaleDateString({}, {month:"short", day:"numeric", year: "numeric"}) + "\n" +
                              from_time.toLocaleTimeString({}, {hour: "numeric", minute: "numeric"}));
    }

    worker.postMessage({show: {from: from_meta.id,
                               at: at_meta.id}});

}

var render_removed_state = function(state){
    if(state){
        el.remove_expand.classList.add('selected');
        el.remove_collapse.classList.remove('selected');
    } else {
        el.remove_expand.classList.remove('selected');
        el.remove_collapse.classList.add('selected');
    }
    render_for_settings();
}


var on_document_ready = function(){
    el.remove_expand  = document.getElementById('revisions_remove_expand');
    el.remove_collapse  = document.getElementById('revisions_remove_collapse');
    el.info = document.getElementById('revision_info');
    el.tick_box = document.getElementById('revision_tick_box');
    el.at_range = document.getElementById('revision_at_range');
    el.from_range = document.getElementById('revision_from_range');
    el.caption_at = document.getElementById('revision_caption_at');
    el.caption_from = document.getElementById('revision_caption_from');
    el.revisions_view = document.getElementById('revisions_view');
    el.ordered_list = document.getElementById('revisions_ordered_list');
    dn.g_settings.addEventListener('VALUE_CHANGED', function(e){
        if(e.property === 'historyRemovedIsExpanded')
            render_removed_state(e.newValue);
    });
      
    // controllers
    el.remove_expand.addEventListener('click', function(){
        dn.g_settings.set('historyRemovedIsExpanded', true);
    })
    el.remove_collapse.addEventListener('click', function(){
        dn.g_settings.set('historyRemovedIsExpanded', false);
    })

    el.at_range.addEventListener("change", render_for_settings);
    el.from_range.addEventListener("change", render_for_settings);
}


/*
var close_history = function(){
    dn.file_history.$revisions_display.remove();
    window.removeEventListener("resize", dn.revisions_window_resize);
    document.getElementById('the_editor').style.display = '';
    dn.editor.resize();
    dn.is_showing_history = false;
}
var revisions_window_resize = function(){
    if(dn.file_history.canShowResizeError){
        dn.show_error("The history explorer displays poorly if you resize the window while it is open. (This is a bug.)");
        dn.file_history.canShowResizeError = false; //wait at least dn.const.error_delay_ms until displaying the error again
        setTimeout(function(){dn.file_history.canShowResizeError = true;},dn.const.error_delay_ms);
    }    
}

var start_revisions_worker = function(){
  
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
        dn.revision_set_is_expaned(dn.g_settings.get('historyRemovedIsExpanded'))

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

var revision_set_at = function(r,fromChangeEvent,fromTimelineCreation){
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

var revision_set_from = function(r,fromChangeEvent,fromTimelineCreation){
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

var display_revision_timeline = function(newRevisions){
    var h = dn.file_history;
    var rs = h.revisions;
    //TODO: update display based on newRevisions rather than starting from scratch
    
    h.$at_range = $("<input class='revision_at_range' type='range' min='0' max='" + (rs.length-1) + "'/>");
    h.$tick_box = $("<div class='tick_box'/>");
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

var revision_worker_delivery = function(e){
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


*/


return {
    start: start,
    end: end,
    on_document_ready: on_document_ready
};


})();
