"use strict";
// DRIVE NOTEPAD 2016
// by DM

dn.version_str = '2016a';

// ############################
// Constants and defaults, see alsp info.js
// ############################

dn.can_show_drag_drop_error = true;
dn.is_showing_history = false;

dn.status = {

    file_body: 1, // 0 while getting, 1 when done or irrelevant, -1 if failed
    file_meta: 1, // 0 while getting, 1 when done or irrelevant, -1 if failed
    file_new: 1, // 0 while creating a new file, 1 when done or irrelevant, -1 if failed

    file_sharing: 0, // after launching the sharing dialog this is set to -1 for everafter

    authentication: 0, // 0 while authenticating, 1 when done

    popup_active: 0, // 0 or 1, i.e. true or false
    local_settings: 0, // 1 when local settings have been loaded
    realtime_settings: 0, // 1 when realtime settings have been loaded

    // 1: success/no save active, 
    // 0: in progress
    // -1: failure, and abandonded further attempts (never used)
    save_body: 1, 
    save_title: 1,
    save_other: 1,

    unsaved_changes: 0 // 1 true, 0 false
}

dn.the_file = new dn.FileModel();

dn.change_line_history = [];
dn.last_change = null;
dn.change_line_classes =(function(rootStr,trueN,factor){
    var x = [''];
    for(var i=trueN;i;i--)for(var k=0;k<factor;k++)
        x.push(rootStr + i);
    return x;
})('recent_line_',8,5)
dn.change_line_classes_rm =(function(rootStr,trueN,factor){
    var x = [''];
    for(var i=trueN;i;i--)for(var k=0;k<factor;k++)
        x.push(rootStr + i);
    return x;
})('recent_line_rm',8,5)


dn.el = dn.el || {};

dn.toggle_permission = function(state){
    var el = dn.el.pane_permissions;
    if(state){
        if(!dn.status.permissions_showing){
            dn.status.permissions_showing = 1;
            el.style.display = '';
            dn.g_settings.set('pane', 'pane_help');
            dn.g_settings.set('pane_open', true);
            css_animation(dn.el.the_widget, 'shake', function(){}, dn.const.error_delay_ms);
        }
    } else {
        dn.status.permissions_showing = 0;
        el.style.display = 'none';
    }
}

dn.show_pane = function(id){
    if(id === "pane_permissions")
        return dn.toggle_permission(true);

    var el = document.getElementById(id);

    // el can be undefined/null to hide everything
    for(var ii=0; ii < dn.el.widget_content.children.length; ii++)
        if(dn.el.widget_content.children[ii] !== el && dn.el.widget_content.children[ii] !== dn.el.pane_permissions){
            dn.el.widget_content.children[ii].style.display = 'none';
            var el_icon = dn.menu_icon_from_pane_id[dn.el.widget_content.children[ii].id];
            if(el_icon)
                el_icon.classList.remove('icon_selected');
    }

    if(el){
        el.style.display = '';
        var el_icon = dn.menu_icon_from_pane_id[el.id];
        if(el_icon)
            el_icon.classList.add('icon_selected')
    }else{
        dn.g_settings.set('pane_open', false);
    }
}

dn.widget_mouse_down = function(e){
    dn.widget_mouse_down_info = {
            off_left: -e.clientX,
            off_top: -e.clientY,
            start_time: Date.now(),
            is_dragging: e.button !== 0};
    e.preventDefault();
    document.addEventListener('mousemove', dn.document_mouse_move_widget);
    document.addEventListener('mouseup', dn.document_mouse_up_widget);
}

dn.document_mouse_move_widget = function(e){
    var x = e.clientX+dn.widget_mouse_down_info.off_left;
    var y = e.clientY+dn.widget_mouse_down_info.off_top;
    if(!dn.widget_mouse_down_info.is_dragging){
        dn.widget_mouse_down_info.is_dragging = (Date.now() - dn.widget_mouse_down_info.start_time > dn.const.drag_delay_ms)
                                              || (x*x + y*y > dn.const.drag_shift_px * dn.const.drag_shift_px);
    }
    if(dn.widget_mouse_down_info.is_dragging)
        translate(dn.el.the_widget, x, y);
    e.stopPropagation();

};

dn.document_mouse_up_widget = function(e){
    document.removeEventListener('mousemove', dn.document_mouse_move_widget);
    document.removeEventListener('mouseup', dn.document_mouse_up_widget);

    if(dn.widget_mouse_down_info.is_dragging){
        var pos = dn.el.the_widget.getBoundingClientRect();
        translate(dn.el.the_widget, 0, 0);
    
        //work out what widget_anchor should be
        var widget_w = dn.el.the_widget.offsetWidth;
        var widget_h = dn.el.the_widget.offsetHeight;
        var window_w = window.innerWidth;
        var window_h = window.innerHeight;
        var anchor = []
        if(pos.left < window_w - (pos.left + widget_w)){
            anchor[0] = 'l'; //anchor left side by window width percentage
            anchor[1] = Math.max(0,pos.left/window_w * 100);
        }else{
            anchor[0] = 'r'; //anchor right side by window width percentage
            anchor[1] = Math.max(0,(window_w - (pos.left + widget_w))/window_w * 100);
        }
        if(pos.top < window_h - (pos.top+ widget_h)){
            anchor[2] = 't'; //anchor top side by window height percentage
            anchor[3] = Math.max(0,pos.top/window_h * 100);
        }else{
            anchor[2] = 'b'; //anchor bottom side by window height percentage
            anchor[3] = Math.max(0,(window_h - (pos.top + widget_h))/window_h * 100);
        }

        if(dn.g_settings)
            dn.g_settings.set("widget_anchor",anchor); 

    }else{
        dn.g_settings.set('pane_open', !dn.g_settings.get('pane_open'));
    }
    dn.widget_mouse_down_info = undefined;
};

dn.widget_apply_anchor = function(anchor){
    anchor = Array.isArray(anchor) ? anchor : dn.g_settings.get('widget_anchor');
    var widget_w = dn.el.the_widget.offsetWidth;
    var widget_h = dn.el.the_widget.offsetHeight;
    var window_w = window.innerWidth;
    var window_h = window.innerHeight;

    if(anchor[0] == 'l'){
        // horizontal position is anchored to a fixed percentage of window width on left of widget
        if(window_w * anchor[1]/100 + widget_w > window_w){
            dn.el.the_widget.style.left = 'inherit';
            dn.el.the_widget.style.right = '0px'; //if the widget would overlap the right edge, then instead put it precisely on the right edge
        }else{
            dn.el.the_widget.style.left = anchor[1] + '%';
            dn.el.the_widget.style.right = ''; //use the anchor exactly
        }

        // set toolbar position
        dn.el.widget_menu.classList.add('flipped');
        dn.el.widget_content.classList.add('flipped');
        var els = document.getElementsByClassName('widget_menu_icon');
        for(var ii=0; ii<els.length; ii++)
            els[ii].classList.add('flipped');

    }else{
        // horizontal position is anchored to a fixed percentage of window width on right of widget
        if( window_w * anchor[1]/100 + widget_w > window_w){
            dn.el.the_widget.style.left = '0px';
            dn.el.the_widget.style.right = ''; //if the widget would overlap the left edge, then instead put it precisely on the left edge
        }else{
            dn.el.the_widget.style.left = 'inherit';
            dn.el.the_widget.style.right = anchor[1] + '%'; //use the anchor exactly
        }

        // set toolbar position
        dn.el.widget_menu.classList.remove('flipped');
        dn.el.widget_content.classList.remove('flipped');
        var els = document.getElementsByClassName('widget_menu_icon');
        for(var ii=0; ii<els.length; ii++)
            els[ii].classList.remove('flipped');
    }

    if(anchor[2] == 't'){
        // vertical position is anchored to a fixed percentage of window height on top of widget
        if(window_h * anchor[3]/100 + widget_h > window_h){
            dn.el.the_widget.style.top = 'inherit';
            dn.el.the_widget.style.bottom = '0px';  
        }else{
            dn.el.the_widget.style.top = anchor[3] + '%';
            dn.el.the_widget.style.bottom = ''; 
        }
    }else{
        // vertical position is anchored to a fixed percentage of window height on bottom of widget
        if(window_h * anchor[3]/100 + widget_h > window_h){
            dn.el.the_widget.style.top = '0px';
            dn.el.the_widget.style.bottom = ''; 
        }else{
            dn.el.the_widget.style.top = 'inherit';
            dn.el.the_widget.style.bottom = anchor[3] + '%'; 
        }
    }



}

dn.toggle_widget = function(state){
    // provide argument "true" to open widget, "false" to close
    if(state){
        dn.el.widget_menu.style.display = '';
        dn.el.widget_content.style.display = '';
    }else{
        dn.el.widget_menu.style.display = 'none';
        dn.el.widget_content.style.display = 'none';
    }
}

dn.show_status = function(){
    // TODO: drag-drop from disk
    var s = ''

    if (dn.status.file_new === 1 && dn.status.file_meta === 1 && dn.status.file_body === 1){
        s = dn.the_file.title;
        var extra = [];
        if(dn.the_file.is_brand_new)
            extra.push("ex nihilo omnia...");
        if(dn.the_file.is_read_only)
            extra.push("read-only");
        if(dn.the_file.is_shared)
            extra.push("shared");
        if(dn.status.file_sharing == -1)
            extra.push("sharing status unknown");
        if(dn.status.unsaved_changes)
            extra.push("unsaved changes");
        if(dn.status.save_body == 0){
            extra.push("saving document"); // this means that *at least* the body is being saved, possibly more
        } else {
            if(dn.status.save_title == 0)
                extra.push("updating title");
            if(dn.status.save_other == 0)
                extra.push("updating file properties")
        } 
        if(extra.length)
            s += "\n[" + extra.join(', ') + "]"; 
    }else if(dn.status.file_new === 0)
        s = "Creating new file";
    else if(dn.status.file_new === -1)
        s = "Failed to create new file";
    else if(dn.status.file_meta === 0 && dn.status.file_body === 0)
        s = "Loading file:\n" + dn.the_file.file_id;
    else if(dn.status.file_meta === 1 && dn.status.file_body === 0)
        s = "Loading " + (dn.the_file.is_read_only? 'read-only ' : '' ) + 
                "file:\n" + dn.the_file.title;
    else if(dn.status.file_meta === 0 && dn.status.file_body === 1)
        s = "Loading metadata for file:\n" + dn.the_file.file_id;
    else if(dn.status.file_meta === 1) // and -1
        s = "Failed to download " + (dn.the_file.is_read_only? 'read-only ' : '' )
                +  "file:\n" + dn.the_file.title;
    else if(dn.status.file_body === 1) // and -1
        s = "Failed to download metadata for file:\n" + dn.the_file.file_id;
    else // file_body and file_meta both -1
        s = "Failed to load file:\n" + dn.the_file.file_id;
    

    if(dn.status.authentication != 1){
        // auth in progress or failed
        if (s)
            s += "\n";
        if(dn.status.authorization == -1)
            s += "Authorization required...";
        else if(dn.status.popup_active)
            s += "Login/authenticate with popup...";
        else
            s += "Authenticating...";
    }

    text_multi(dn.el.widget_text, s, true);

    if(dn.status.save_body == 0 || dn.status.save_title == 0 || dn.status.save_other == 0)
        dn.el.widget_pending.style.display = '';
    else
        dn.el.widget_pending.style.display = 'none';
}

dn.show_error = function(message){
    console.log(message); //it's just useful to do this too
    text_multi(dn.el.widget_error_text, message,true);
    dn.el.widget_error.style.display = '';
    css_animation(dn.el.the_widget, 'shake', function(){
        dn.el.widget_error.style.display = 'none';
    }, dn.const.error_delay_ms);
}

// ############################
// Settings stuff
// ############################

dn.g_settings = (function(){ 
    // This acts as a mock realtime model to be used until the real model is initialised
    var ob = {};
    var keeps = {};
    var change_listeners = [];
    return {
           get: function(k){
            return ob[k]
        }, set: function(k,v){
            if(ob[k] === v) return;
            ob[k] = v;
            for(var ii=0;ii<change_listeners.length;ii++)
                change_listeners[ii]({property: k, newValue: v});
        }, keep: function(k){
            keeps[k] = true
        }, get_keeps: function(){
            return keeps;
        }, addEventListener: function(flag, callback){
            if(flag !== "VALUE_CHANGED") throw "only VALUE_CHANGED"
                change_listeners.push(callback);
        }, transfer_to_true_model: function(real_model){
            // issue changes due to differences in the real and mock models
            for(var k in ob)if(ob.hasOwnProperty(k) && !keeps[k])
                if(JSON.stringify(ob[k]) !== JSON.stringify(real_model.get(k)))
                    this.set(k, real_model.get(k)); // will call listeners
            // and then register the listeners on the new model
            while(change_listeners.length)
                real_model.addEventListener(gapi.drive.realtime.EventType.VALUE_CHANGED, change_listeners.shift());
        }
    };                          
})();

dn.load_default_settings = function(){
  //Lets show the user either the defualt settings or the 
  //ones last used on this browser (restricted to impersonal settings only)
  dn.status.local_settings = 0;
  try{
    console.log('Loading default/localStorage settings...');
    for(var s in dn.default_settings)
        if(dn.impersonal_settings_keys.indexOf(s) == -1 || !localStorage || !localStorage["g_settings_" +s])
            dn.g_settings.set(s, dn.default_settings[s]);
        else
            dn.g_settings.set(s, JSON.parse(localStorage["g_settings_" + s]));
  }catch(err){
      if(localStorage) 
        localStorage.clear();
      console.log("Failed to load defaults/localStorage settings.  Have cleared localStorage cache.")
  }
  dn.status.local_settings = 1;
}


dn.show_app_data_document = function(doc){

    var old_temp_g_settings = dn.g_settings;
    dn.g_settings = doc.getModel().getRoot();

    // some settings we want to override the cloud values with changes we made locally,
    // other settings may have been missing in the cloud entirely.
    console.log("Transfering to realtime model for settings.")
    old_temp_g_settings.transfer_to_true_model(dn.g_settings);
    var existing_cloud_keys = dn.g_settings.keys();
    for(var s in dn.default_settings)
        if(s in old_temp_g_settings.get_keeps() || existing_cloud_keys.indexOf(s) == -1)
            dn.g_settings.set(s, old_temp_g_settings.get(s));

    // TODO: check these history things are right
    dn.g_clipboard = dn.g_settings.get('clipboard');
    if(!dn.g_clipboard){
        dn.g_settings.set('clipboard', doc.getModel().createList());
        dn.g_clipboard = dn.g_settings.get('clipboard');
    }
    dn.g_find_history = dn.g_settings.get('findHistory');
    if(!dn.g_find_history){
        dn.g_settings.set('findHistory', doc.getModel().createList());
        dn.g_find_history = dn.g_settings.get('findHistory');
    }
    
    //Check lastDNVersionUsed at this point - by default it's blank, but could also have an out-of-date value
    if(dn.g_settings.get('lastDNVersionUsed') != dn.version_str){
        dn.g_settings.set('help_inner', 'tips');
        dn.g_settings.set('pane', 'pane_help');
        dn.g_settings.set('pane_open', 'true');
        dn.g_settings.set('lastDNVersionUsed', dn.version_str);
    }

    dn.status.realtime_settings = 1;
}


dn.settings_changed = function(e){
    var new_value = e.newValue;
    console.log("[user settings] " + e.property +": " + new_value);
    if(dn.impersonal_settings_keys.indexOf(e.property)>-1 && localStorage){
        localStorage["g_settings_" + e.property] = JSON.stringify(new_value);
    }
    try{
        switch(e.property){
            case "widget_anchor":
            dn.widget_apply_anchor(new_value);
            break;

            case "theme":
            dn.editor.setTheme('ace/theme/' + new_value);
            break;

            case "fontSize":
            var scrollLine = dn.get_scroll_line();
            dn.editor.setFontSize(new_value + 'em')    
            dn.editor.scrollToLine(scrollLine);
            break;

            case "wordWrap":
            var s = dn.editor.getSession();
            var scrollLine = dn.get_scroll_line();
            s.setUseWrapMode(new_value[0]);
            s.setWrapLimitRange(new_value[1],new_value[2]);
            dn.editor.scrollToLine(scrollLine);
            break;

            case "wordWrapAt":
            var curWrap = dn.g_settings.get('wordWrap');
            if(curWrap[1] && curWrap[1] != new_value)
                dn.g_settings.set('wordWrap',[1,new_value,new_value]);
            dn.editor.setPrintMarginColumn(new_value);
            break;

            case "showGutterHistory":
            var s = dn.editor.getSession(); 
            if(!new_value){
                var h = dn.change_line_history;
                for(var i=0;i<h.length;i++)if(h[i])
                    s.removeGutterDecoration(i,h[i]<0 ? dn.change_line_classes_rm[-h[i]] : dn.change_line_classes[h[i]]);
                dn.change_line_history = []; 
            }
            break;

            case "newLineDefault":
            if(dn.the_file.loaded_body)
                dn.the_file.compute_newline();
            break;

            case "historyRemovedIsExpanded":
            dn.revision_set_is_expaned(new_value);
            break;

            case "softTabN":
            case "tabIsHard":        
            if(dn.the_file.loaded_body)
                dn.the_file.compute_newline();
            break;

            case 'pane_open':
            dn.toggle_widget(new_value)
            if(dn.g_settings.keep)
                dn.g_settings.keep('pane_open');
            break;

            case 'pane':
            dn.show_pane(new_value);
            if(dn.g_settings.keep)
                dn.g_settings.keep('pane');
            if(new_value !== 'pane_help')
                dn.g_settings.set('help_inner', 'main');
            break; 
        }
    }catch(err){
        console.log("Error while uptating new settings value.")
        console.dir(e);
        console.dir(err);
    }
}

dn.get_scroll_line = function(){
    return  dn.editor.getSession().screenToDocumentPosition(dn.editor.renderer.getScrollTopRow(),0).row;
}



// ############################
// Clipboard stuff
// ############################

dn.document_clipboard_left = function(){
        if(!dn.clipboard_active)
            return false;

        if( dn.clipboard_index <= 0)
            return true;
        dn.clipboard_index--;
        dn.editor.undo();
        dn.editor.insert(dn.g_clipboard.get(dn.clipboard_index));
        return true;
}

dn.document_clipboard_right = function(){
        if(!dn.clipboard_active)
            return false;

        if( dn.clipboard_index >= dn.g_clipboard.length-1)
            return true;

        dn.clipboard_index++;
        dn.editor.undo();
        dn.editor.insert(dn.g_clipboard.get(dn.clipboard_index));
        return true;
}

dn.document_clipboard_keyup = function(e){
    if(e.which == 17 || e.which == 91 || !e.ctrlKey){
        $(document).off('keyup',dn.document_clipboard_keyup);
        dn.clipboard_active = false;
        dn.el.pane_clipboard.style.display = 'none';
        if(dn.clipboard_info_timer){
            clearTimeout(dn.clipboard_info_timer);
            dn.clipboard_info_timer = null;
        }
    }
}

dn.on_paste = function(text){
    if (dn.g_clipboard === undefined)
        return;
    
    $(document).on('keyup',dn.document_clipboard_keyup);
    dn.clipboard_active = true;
        
    dn.clipboard_index = dn.g_clipboard.lastIndexOf(text); 
    if(dn.clipboard_index == -1){ //it's possible the user copied some text from outside the DN, in which case we will add it to the clipboard now
       dn.clipboard_index = dn.g_clipboard.push(text);
       while(dn.g_clipboard.length > dn.const.clipboard_max_length) //same as on copy
         dn.g_clipboard.remove(0);
    }
    if(dn.clipboard_info_timer)
        clearTimeout(dn.clipboard_info_timer);

    dn.clipboard_info_timer = setTimeout(function(){
        dn.clipboard_info_timer = null;
        dn.el.pane_clipboard.style.display = '';
    },dn.const.clipboard_info_delay);
}

dn.on_copy = function(text){
    if (dn.g_clipboard === undefined)
        return;
    
    dn.g_clipboard.push(text);
    while(dn.g_clipboard.length >dn.const.clipboard_max_length)
        dn.g_clipboard.remove(0);
}



// ############################
// Load stuff
// ############################



dn.show_file_meta = function(resp) {
    // this is called both by file loading and by creation of new file
    if (resp.error)
        throw Error(resp.error);
    dn.the_file.file_id = resp.result.id;
    dn.the_file.set({title: resp.result.name,
                     description: resp.result.description || '',
                     is_read_only: !resp.result.capabilities.canEdit,
                     is_shared: resp.result.shared});
    if(resp.result.properties){
        if(resp.result.properties.aceMode !== undefined)
            dn.the_file.set({syntax: resp.result.properties.aceMode})
        if(resp.result.properties.newline !== undefined)
            dn.the_file.set({newline: resp.result.properties.newline})
        // TODO: set tabs
    }
    if(resp.result.parents && resp.result.parents.length){
        dn.the_file.folder_id = resp.result.parents[0];
        dn.set_drive_link_to_folder();
    }

    // set the url to match the file
    history.replaceState({}, dn.the_file.title, '//' + location.host + location.pathname + "?"
             + "state=" + JSON.stringify({action: "open", ids: [dn.the_file.file_id]}));

    //whether we were creating a new file or loading meta for existing, neither is still in progress 
    dn.status.file_meta = 1; 
    dn.status.file_new = 1;
    dn.show_status();
} 

dn.show_file_body = function(resp){
    dn.setting_session_value = true;
    dn.the_file.loaded_body = resp.body; //this gets used for newline and tab detection, i.e. we don't want the editor to mangle it in any way
    dn.editor.session.setValue(resp.body);
    dn.setting_session_value = false;
    dn.status.file_body = 1;
    dn.show_status();
}


// ############################
// Change/history stuff
// ############################

dn.on_change = function(e){
    //console.dir(e);

    if(!e.start || !e.end || dn.setting_session_value)
        return;
        
    if(!dn.status.unsaved_changes){
        dn.status.unsaved_changes = true;
        dn.render_document_title();
        dn.show_status();
    }

    if(!dn.g_settings.get('showGutterHistory'))
        return;

    var nClasses = dn.change_line_classes.length-1;
    var h = dn.change_line_history;
    var s = dn.editor.getSession(); 

    var start_row = e.start.row;
    var end_row = e.end.row;

    if(dn.last_change && dn.last_change.start_row == start_row && dn.last_change.end_row == end_row && start_row == end_row
        && dn.last_change.action.indexOf("Text") != -1 && e.action.indexOf("Text") != -1){
            //if this change and the last change were both on the same single lines with action (insert|remove)Text...

            if(dn.last_change.action == e.action){
                return; //same action as last time
            }else if(e.action == "removeText"){ // new action is removeText, old action was insertText
                s.removeGutterDecoration(start_row,dn.change_line_classes[nClasses]);
                s.addGutterDecoration(start_row,dn.change_line_classes_rm[nClasses]);
                h[start_row] = -nClasses;
                dn.last_change.action = "removeText";
                return;
            }else{// new action is isnertText, old action was removeText
                s.removeGutterDecoration(start_row,dn.change_line_classes_rm[nClasses]);
                s.addGutterDecoration(start_row,dn.change_line_classes[nClasses]);
                h[start_row] = nClasses;
                dn.last_change.action = "insertText";
                return;
            }

    }else{
        //otherwise we have an acutal new change
        dn.last_change = {start_row: start_row, end_row: end_row, action: e.action};
    }

    //remove all visible decorations and update the changeLineHistory values (we'll add in the new classes at the end)
    for(var i=0;i<h.length;i++)if(h[i])
        s.removeGutterDecoration(i,h[i] < 0 ? 
                    dn.change_line_classes_rm[-h[i]++] : 
                    dn.change_line_classes[h[i]--]);

    //Update the changeLineHistory relating to the current changed lines
    if(e.action == "removeLines"){
        h.splice(start_row, end_row - start_row + 1);        
        h[start_row] = h[start_row+1] = -nClasses;
    }else if(e.action === "removeText"){
        h[start_row] = -nClasses;
    }else{
        var newLineCount = 0;
        if(e.action == "insertText")
            newLineCount = (e.text.match(/\n/g) || []).length;
        if(e.action == "insertLines")
            newLineCount = e.lines.length;
        h.splice.apply(h,[start_row,0].concat(Array(newLineCount)));

        for(var i=start_row;i<=end_row;i++)
            h[i] = nClasses;

    }

    for(var i=0;i<h.length;i++)if(h[i])
        s.addGutterDecoration(i,h[i]<0 ?
                dn.change_line_classes_rm[-h[i]] :
                dn.change_line_classes[h[i]]);
} 

dn.query_unload = function(){
    if(dn.status.unsaved_changes)
        return "If you leave the page now you will loose the unsaved " + (dn.the_file.is_brand_new ? "new " : "changes to ") + "file '" + dn.the_file.title + "'."
}

dn.set_drive_link_to_folder = function(){
    var els = document.getElementsByClassName('link_drive');
    var href = dn.the_file.folder_id ? 
                'https://drive.google.com/#folders/' + dn.the_file.folder_id 
                : 'https://drive.google.com';
    for(var ii=0; ii<els.length; ii++)
        els[ii].href = href;
    // TODO: set new links to have this folder too
}

dn.show_user_info = function(a){
    dn.user_info = a.result;
    dn.help_pane.on_user_name_change(a.result.name);
}

dn.render_document_title = function(){
    document.title = (dn.status.unsaved_changes ? "*" : "") + dn.the_file.title;
}

dn.set_editor_newline = function(){
    // view for dn.the_file model
    dn.editor.session.setNewLineMode(dn.the_file.properties_chosen.newline);
}

dn.set_editor_tabs = function(){
    // view for dn.the_file model
    var val = dn.the_file.properties_chosen.tabs;
    if(val.val === "hard"){
        dn.editor.session.setUseSoftTabs(false);
    }else{
        dn.editor.session.setUseSoftTabs(true);
        dn.editor.session.setTabSize(val.n);
    }
}

dn.set_editor_syntax = function(){
    // view for dn.the_file model
    var mode_str = dn.the_file.properties_chosen.syntax;
    var modes_array = require("ace/ext/modelist").modes;
    for(var ii=0; ii<modes_array.length;ii++)if(modes_array[ii].caption === mode_str){
        dn.editor.getSession().setMode(modes_array[ii].mode);
        return;
    }    
    dn.show_error("unrecognised syntax mode requested");
}


dn.document_ready = function(e){

    // widget :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
    dn.el.the_widget = document.getElementById('the_widget');
    dn.el.widget_text = document.getElementById('widget_text');
    dn.el.widget_error_text = document.getElementById('widget_error_text');
    dn.el.widget_error = document.getElementById('widget_error');
    dn.el.widget_content = document.getElementById('widget_content');
    dn.el.widget_pending = document.getElementById('widget_pending');
    dn.el.the_widget.addEventListener('mousedown', dn.widget_mouse_down);
    translate(dn.el.the_widget, 0, 0);
    dn.el.the_widget.style.display = '';
    dn.el.widget_error.style.display = 'none';
    dn.el.widget_content.addEventListener('mousedown', prevent_default_and_stop_propagation);
    var els = dn.el.widget_content.getElementsByTagName('input');
    for(var ii=0; ii<els.length; ii++)
        els[ii].addEventListener('mousedown', stop_propagation); // prevents propagation to preventDefault, installed above.
    var els = dn.el.widget_content.getElementsByTagName('textarea');
    for(var ii=0; ii<els.length; ii++)
        els[ii].addEventListener('mousedown', stop_propagation); // prevents propagation to preventDefault, installed above.

    // editor :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
    var editor_el = document.getElementById('the_editor');
    editor_el.innerHTML = '';
    editor_el.addEventListener('contextmenu', function(e){
        dn.show_error("See the list of keyboard shortcuts for copy/paste, select-all, and undo/redo.")
    });
    dn.editor = ace.edit("the_editor");
    dn.editor.setHighlightSelectedWord(true);
    dn.el.ace_content = document.getElementsByClassName('ace_content')[0];
    dn.editor.getSession().addEventListener("change", dn.on_change);
    dn.focus_editor = dn.editor.focus.bind(dn.editor);
    dn.focus_editor();
    dn.editor.on("paste", dn.on_paste);
    dn.editor.on("copy", dn.on_copy);
    dn.editor.setAnimatedScroll(true);
    dn.editor.$blockScrolling = Infinity; // disables scrolling message
    
    // widget menu ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
    dn.el.widget_menu = document.getElementById('widget_menu');
    dn.el.menu_open = document.getElementById('menu_open');
    dn.el.menu_find = document.getElementById('menu_find');
    dn.el.menu_help = document.getElementById('menu_help');
    dn.el.menu_file = document.getElementById('menu_file');
    dn.el.menu_general_settings = document.getElementById('menu_general_settings');
    dn.el.widget_menu.addEventListener('mousedown', prevent_default_and_stop_propagation);
    dn.menu_icon_from_pane_id = {}
    var els = dn.el.widget_menu.getElementsByClassName('widget_menu_icon');
    for(var ii=0; ii<els.length; ii++){
        els[ii].title = dn.menu_id_to_caption[els[ii].id];
        dn.menu_icon_from_pane_id['pane_' + els[ii].id.substr(5)] = els[ii];
    }

    dn.el.pane_clipboard = document.getElementById('pane_clipboard');
    dn.el.pane_permissions = document.getElementById('pane_permissions');
    document.getElementById('button_auth').addEventListener('click', dn.reauth_manual);

    // widget panes ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

     // pane file 
    dn.el.pane_file = document.getElementById('pane_file');
    dn.file_pane.on_document_ready();
    dn.el.menu_file.addEventListener('click', function(){
        dn.g_settings.set('pane', 'pane_file');
    })

     // pane general settings
    dn.el.pane_general_settings = document.getElementById('pane_general_settings');
    dn.settings_pane.on_document_ready();
    dn.el.menu_general_settings.addEventListener('click', function(){
        dn.g_settings.set('pane', 'pane_general_settings');
    })

    // pane help 
    dn.el.pane_help = document.getElementById('pane_help');
    dn.help_pane.on_document_ready();
    dn.el.menu_help.addEventListener('click', function(){
        dn.g_settings.set('pane', 'pane_help');
    })

    // pane find
    dn.el.pane_find = document.getElementById('pane_find');
    dn.find_pane.on_document_ready();
    dn.el.menu_find.addEventListener('click', function(){
        dn.g_settings.set('pane', 'pane_find');
        dn.find_pane.focus_on_input();
    });

    // pane open
    dn.el.pane_open = document.getElementById('pane_open');
    dn.open_pane.on_document_ready();
    dn.el.menu_open.addEventListener('click', function(){    
        dn.g_settings.set('pane', 'pane_open');
    });
    
    // :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
    dn.g_settings.addEventListener("VALUE_CHANGED", dn.settings_changed);
    dn.make_keyboard_shortcuts();
    dn.load_default_settings();
    document.addEventListener('contextmenu', prevent_default);
    window.addEventListener('resize', dn.widget_apply_anchor);
    window.onbeforeunload = dn.query_unload;

    //work out whether a fileid was specified in page load, and if not, whether a folderid was.
    var params = window_location_to_params_object(); 
    var new_in_folder = undefined;
    if(params['state']){
        try{
            var state = JSON.parse(params['state']); 
            if(state.action && state.action == "open" && state.ids && state.ids.length > 0)
               dn.the_file.file_id = state.ids[0];
            else
               new_in_folder = state.folderId; //could be undefiend
        }catch(e){
            dn.show_error("Bad URL params, creating a new file.");
        }
    }

    dn.pr_file_loaded = new SpecialPromise();

    dn.the_file.addEventListener("change", function(e){
        switch(e.property){
            case "title":
            dn.render_document_title();
            break;

            case "syntax":
            dn.set_editor_syntax();
            break;

            case "newline":
            dn.set_editor_newline();
            break;

            case "tabs":
            dn.set_editor_tabs();
            break;
        }            
    });

    // The auth promise can be rejected and resolved multiple times during the lifetime of the app.
    // These two handlers will always be called for those events.
    dn.pr_auth.on_error(dn.handle_auth_error); 
    dn.pr_auth.on_success(function(){
        // reset some things, could be no-ops...
        dn.reauth_auto_delay = 0;
        dn.toggle_permission(false);
        dn.status.popup_active = 0;

        // and show the good news...
        dn.status.authentication = 1;
        dn.show_status(); 
    })

    // get user info...
    until_success(function(succ, fail){
        Promise.resolve(dn.pr_auth)
               .then(dn.request_user_info)
               .then(dn.show_user_info)
               .then(succ, fail);
    }, dn.pr_auth.reject.bind(dn.pr_auth))
    .then(function(){
        console.log('succeeded getting user info.')
    })
    
    if(dn.the_file.file_id){
        // load existing file :::::::::::::::::::::::::::::::::::::::::::::::::::
        dn.status.file_meta = 0;
        dn.status.file_body = 0;
        dn.show_status();

        // meta data...
        var pr_meta = until_success(function(succ, fail){
            Promise.resolve(dn.pr_auth)
                   .then(dn.request_file_meta)
                   .then(dn.show_file_meta)
                   .catch(function(err){
                        if(dn.is_auth_error(err)) throw err; // until_success will handle these errors and retry
                        dn.show_error(err.result.error.message);
                        dn.status.file_meta = -1;
                        dn.show_status();
                        return 'bad' // a form of success
                   }).then(succ, fail);
        }, dn.pr_auth.reject.bind(dn.pr_auth));

        // body...
        var pr_body = until_success(function(succ, fail){
            Promise.resolve(dn.pr_auth)
                   .then(dn.request_file_body)
                   .then(dn.show_file_body)
                   .catch(function(err){
                        if(dn.is_auth_error(err)) throw err;  // until_success will handle these errors and retry
                        dn.show_error(err.result.error.message);
                        dn.status.file_body = -1;
                        dn.show_status();
                        return 'bad' // a form of success
                   }).then(succ, fail);
        }, dn.pr_auth.reject.bind(dn.pr_auth));

        // load meta data and body...
        Promise.all([pr_meta, pr_body])
            .then(function(vals){
                if(vals[0] === 'bad' || vals[1] === 'bad') throw "bad"
                console.log("succeeded loading file body and metadata.");
                dn.the_file.set({is_loaded: true});
                dn.pr_file_loaded.resolve();    
                dn.show_status();
            }).catch(function(err){
                document.title = "Drive Notepad";
                dn.g_settings.set('pane', 'pane_help');
                dn.g_settings.set('pane_open', true);
                console.dir(err);
            });

    } else {
        // create new file :::::::::::::::::::::::::::::::::::::::::::::::::::
        dn.status.file_new = 0;
        dn.show_status();
        dn.the_file.set({title: "untitled.txt", is_loaded: true}); // there's nothing to load for this model

        until_success(function(succ, fail){
            Promise.resolve(dn.pr_auth)
                   .then(dn.request_new(new_in_folder))
                   .then(dn.show_file_meta)
                   .catch(function(err){
                    if(dn.is_auth_error(err)) throw err; // auth error, until_success will handle it
                    dn.show_error(err.result.error.message);
                    dn.status.file_new = -1;
                    dn.show_status();
                    return "bad"
                    }).then(succ, fail);
            }, dn.pr_auth.reject.bind(dn.pr_auth))
            .then(function(result){
                if(result === "bad") throw "bad";
                console.log("suceeded creating file")
                dn.g_settings.set('pane', 'pane_file');
                dn.pr_file_loaded.resolve();
            }).catch(function(err){
                document.title = "Drive Notepad";
                dn.g_settings.set('pane', 'pane_help');
                dn.g_settings.set('pane_open', true);
                console.dir(err);
            });
    }
    
    // load cloud settings ::::::::::::::::::::::::::::::::::::::::::::::::
    until_success(function(succ, fail){ 
        Promise.all([dn.pr_auth, dn.pr_realtime_loaded])
               .then(dn.request_app_data_document)
               .then(dn.show_app_data_document)
               .then(succ, fail)
    }, dn.pr_auth.reject.bind(dn.pr_auth))
    .then(function(){
        console.log('succeeded loading settings');
    });
    
    
}


if (document.readyState != 'loading')
    dn.document_ready();
else
    document.addEventListener('DOMContentLoaded', dn.document_ready);
