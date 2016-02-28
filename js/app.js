"use strict";
// DRIVE NOTEPAD 2016
// by DM

dn.version_str = '2016a';

// ############################
// Constants and defaults, see alsp info.js
// ############################

dn.can_show_drag_drop_error = true;
dn.is_showing_history = false;
dn.apis = {drive_is_loaded: false};

dn.status = {
    // 0: get action in progress
    // -1: failed
    //  1: success
    file_body: 0, 
    file_meta: 0, 
    file_sharing: 0, // after launching the sharing dialog this is set to -1
    authentication: 0,
    popup_active: 0, // 0 or 1, i.e. true or false
    local_settings: 0,
}

dn.the_file = {
    file_id: null,
    folder_id: null,
    title: null,
    description: '',
    ext: '',
    loaded_mime_type: '',
    new_line_detected: 'none', //'windows', 'unix','mixed', or 'none'
    tab_detected: {val: 'none'},
    is_pristine: true, //true while the document has no unsaved changes (set to true when we request the save not when we get confirmation, but if there is a save error it will be reverted to false).
    mime_type: '',
    is_saving: false,
    data_to_save: {body: null, title: null, description: null}, //holds the values until confirmation of success for each
    generation_to_save: {body: 0, title: 0, description: 0},//when saves return they check their this.description etc. against here and clear data_to_save if they match
    is_read_only: false,
    is_shared: false,
    is_brand_new: false, // true from the point of creating a new document till the point we get confirmation of a successful save
    is_reading_file_object: false, //this is used on drag and drop,
    custom_props: {}, //these are the props potentially stored on the file using the custom properties API
    custom_prop_exists: {}, //each of the custom props that actually exsits for the file will have an entry in this obj, with the key being the property and the value being true.
    saving_title_count: 0 //tracks the number of active save request with just the title.  Whatever the resp, this number is decremented,
};
dn.change_line_history = [];
dn.last_change = null;
dn.finding_str = "";
dn.find_result_markers = [];
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

/* ################################################################################################################

    [Some Notes on settings in Drive Notepad]

    There are two kinds of settings: per-user settings and per-file settings.
    
    The user settings are stored in dn.g_settings. When the page is loaded this is a fake Google Realtime model, 
    which uses a mixture of default values and values read from localStorage.  At some point after authenticating 
    the g_settings will become the true Google Realtime model. Whenever a value in g_settings is changed
     dn.setting_changed is called with the appropriate paramaters, this is true right from when the page loads, 
     i.e. the first set of values trigger the SettingsChanged, but after that only modifications will trigger a change
      (regardless of whether g_settings is the true model or not).  Use the .set() and .get() methods on the dn.g_settings.
    
    The per-file settings are stored in dn.the_file.custom_props.  When the page is loaded they are initialised with 
    default values.  Then, if we have opened an existing file, at some point they will be updated with the true values. 
     These settings are *not* a realtime model, rather they are Custom Properties (there's an API for it).  Again, as
      with the per-user settings, whenever the file settings are changed they trigger a call to PropertyUpdated.  Note
       that since this is not backed by a realtime model we won't get changes on the server push to the browser, only
        local changes will be observed.  The per-file settings are shared across anyone who has read and/or write access 
        to the file in question. Note that if the default value is chosen the setting value is simply removed from the file.
          Use the dn.set_property() function to set values and read values straight from the dn.the_file.custom_props object.
    
    For each key "Something" in customProps there is a function dn.apply_something_choice() which will read the per-user 
    and/or the per-file settings (as appropriate) and use the combined result to apply the chosen setting to the editor, 
    additionally the function will render the file settings tab and/or the general settings tab. As part of this function 
    there will likely be a call to dn.detect_something, which will run some fairly simple heuristic over the current file.
      [TODO: may want to cache this, as it can end up getting called several times during loading and possibly elsewhere.] 
      [TODO: may want to have an ApplySomethingChoice for all settings not just those that are covered by customProps.]

################################################################################################################## */


// ############################
// Auth stuff
// ############################

dn.authentication_done = function(auth_result){
    dn.status.popup_active = 0;
    if (!auth_result)
        return dn.authentication_failed(null);
    if(auth_result.error)
        return dn.authentication_failed(auth_result.error);

    dn.status.authentication = 1;
    dn.show_status();

    if(!dn.user_info)
        dn.get_user_info();
    if(dn.the_file.file_id &&  dn.status.file_meta != 1 || dn.status.file_body != 1)
        dn.load_file();
    dn.get_properties_from_cloud();

    // Access token has been successfully retrieved, requests can be sent to the API
    //TODO: make these redundant
    gapi.load('drive-realtime', dn.get_settings_from_cloud());
    gapi.load('drive-share', function(){
        dn.el.share_dialog = new gapi.drive.share.ShareClient(dn.client_id);
    });
}

dn.get_user_info = function(){
   Promise.resolve(
        gapi.client.request({
            'path' : 'userinfo/v2/me?fields=name'
        })).then(function(a){
            dn.user_info = a.result;
            dn.el.user_name.textContent = a.result.name;
        }, function(err){
            // TODO: could be auth problem
            dn.show_error('Failed to get user info');
            console.dir(err);
        });
}

dn.authentication_failed = function(err){
    dn.status.authorization = -1;
    dn.status.popup_active = 0;
    dn.show_status();
    if(err)
        dn.show_error(err.result.error.message);
    else
        dn.show_pane_permissions(); // No access token could be retrieved, force the authorization flow.
}

dn.reauth = function(callback){ 
    // TODO: as promise
    dn.status.authentication = 0;
    dn.show_status();
    gapi.auth.authorize(dn.auth_map(true), function(){
        dn.status.authentication = 1;
        dn.show_status();
        callback();
    });
}

dn.launch_popup = function(){
    dn.status.popup_active = 1;
    dn.status.authorization = 0;
    dn.show_status();    
    Promise.resolve(
        gapi.auth.authorize(dn.auth_map(false)))
        .then(dn.authentication_done,
              dn.authentication_failed);
}

dn.show_pane_permissions = function(){
    dn.g_settings.set('pane', 'pane_permissions');
    css_animation(dn.el.the_widget, 'shake', function(){}, dn.error_delay_ms);
}


// ############################
// Sharing stuff
// ############################

dn.do_share = function(){
    if(!dn.the_file.file_id){
        dn.show_error("You cannot view/modify the sharing settings until you have saved the file.")
        return false;
    }
    dn.status.file_sharing = -1; //TODO: see SO question about no callback for share dialog...how are we supposed to know when it's closed and what happened?
    dn.the_file.is_shared = 0;
    dn.show_status();
    dn.el.share_dialog.setItemIds([dn.the_file.file_id]);
    dn.el.share_dialog.showSettingsDialog();
    return false;
}


// ############################
// Newline stuff
// ############################

dn.detect_new_line = function(str){
    dn.the_file.new_line_detected = (function(){
        //no special reason to use a self-executing function here, it's just lazy coding
        var first_n = str.indexOf("\n");
        if(first_n == -1)
            return dn.show_newline_status("none");
    
        var has_rn = str.indexOf("\r\n") != -1;
        var has_solo_n = str.match(/[^\r]\n/) ? true : false;
        
        if(has_rn && !has_solo_n)
            return dn.show_newline_status("windows");
        if(has_solo_n && !has_rn)
            return dn.show_newline_status("unix")
        
        return dn.show_newline_status("mixed");
    })();    
}

dn.apply_newline_choice = function(str){
        
    var newlineDefault = dn.g_settings.get('newLineDefault');
    
    if(newlineDefault == "windows"){
        dn.el.newline_menu_windows.classList.add('selected')
        dn.el.newline_menu_unix.classList.remove('selected');
    }else{//newlineDefault should be unix
        dn.el.newline_menu_unix.classList.add('selected')
        dn.el.newline_menu_windows.classList.remove('selected');
    }             
                
   if(typeof str == "string")
       dn.detect_new_line(str); //Note that it only makes sense to detect new line on downloaded content
   
   dn.show_newline_status(dn.the_file.new_line_detected); //if default changes after load or we have a new file we need this.
   
    dn.el.file_newline_detect.classList.remove('selected');
    dn.el.file_newline_windows.classList.remove('selected');
    dn.el.file_newline_unix.classList.remove('selected');
   if(dn.the_file.custom_props.newline == "detect"){
        if(dn.the_file.new_line_detected == "windows" || dn.the_file.new_line_detected == "unix")
            dn.editor.session.setNewLineMode(dn.the_file.new_line_detected);
        else
            dn.editor.session.setNewLineMode(newlineDefault);    
        dn.el.file_newline_detect.classList.add('selected');
    }else{
        dn.editor.session.setNewLineMode(dn.the_file.custom_props.newline);
            if(dn.the_file.custom_props.newline == "windows")
                dn.el.file_newline_windows.classList.add('selected');
            else
                dn.el.file_newline_unix.classList.add('selected');            
    }    
}

dn.show_newline_status = function(statusStr){
    var str;
    switch(statusStr){
        case 'none':
            str =  "no newlines detected, default is " + dn.g_settings.get("newLineDefault") + "-like";
            break;
        case 'mixed':
            str = "mixture of newlines detected, default is " + dn.g_settings.get("newLineDefault") + "-like";
            break;
        default:
            str = "detected " + statusStr + "-like newlines";
    }
    
    dn.el.file_newline_info.textContent = "(" + str +")";
    
    return statusStr;
}


// ############################
// Open stuff
// ############################

dn.do_open = function(){
    if(!dn.open_picker){
        var view = new google.picker.View(google.picker.ViewId.DOCS);
        dn.open_picker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.NAV_HIDDEN)
        .setAppId(dn.client_id)
        .setOAuthToken(gapi.auth.getToken().access_token)
        .addView(view)
        .setCallback(dn.picker_callback)
        .build();
    }
    dn.open_picker.setVisible(true);
    return false;
}

dn.picker_callback = function(data) {
  if (data.action == google.picker.Action.PICKED) {
    var fileId = data.docs[0].id;
   dn.focus_editor();
    var url = window.location.href.match(/^https?:\/\/[\w-.]*\/\w*/)[0] +
              "?state={\"action\":\"open\",\"ids\":[\"" + fileId +"\"]}";
    dn.el.opener_button_a.setAttribute('href', url);
    dn.el.opener_button_b.setAttribute('href', url);
    dn.g_settings.set('pane_open', false);
    dn.el.opener_chooser.style.display = '';
    css_animation(dn.el.the_widget, 'shake', function(){}, dn.error_delay_ms);
  }else if(data.action == "cancel"){
     dn.focus_editor();
  } 
}


// ############################
// Widget stuff
// ############################

dn.show_pane = function(el){
    // el can be undefined/null to hide everything

    for(var ii=0; ii < dn.el.widget_content.children.length; ii++)if(dn.el.widget_content.children[ii] !== el){
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
        if(dn.status.local_settings == 1)
            dn.g_settings.set('pane_open', true);
    }else{
       if(dn.status.local_settings == 1)   
            dn.g_settings.set('pane_open', false);
    }
}

dn.widget_mouse_down = function(e){
    dn.widget_mouse_down_info = {
            off_left: -e.clientX,
            off_top: -e.clientY,
            start_time: Date.now(),
            is_dragging: e.button !== 0};
    document.addEventListener('mousemove', dn.document_mouse_move_widget);
    document.addEventListener('mouseup', dn.document_mouse_up_widget);
}

dn.document_mouse_move_widget = function(e){
    var x = e.clientX+dn.widget_mouse_down_info.off_left;
    var y = e.clientY+dn.widget_mouse_down_info.off_top;
    if(!dn.widget_mouse_down_info.is_dragging){
        dn.widget_mouse_down_info.is_dragging = (Date.now() - dn.widget_mouse_down_info.start_time > dn.drag_delay_ms)
                                              || (x*x + y*y > dn.drag_shift_px * dn.drag_shift_px);
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

dn.open_close_widget = function(state){
    // provide argument "true" to open widget, "false" to close

    if(state){
        dn.el.widget_menu.style.display = '';
        dn.el.widget_content.style.display = '';
    }else{
        dn.el.widget_menu.style.display = 'none';
        dn.el.widget_content.style.display = 'none';
    }
   dn.focus_editor();
    return false;
}

dn.show_status = function(){
    // TODO: new file, drag-drop from disk, pristing/saving, modify props, readonly/sharing info
    var s = ''
    if(dn.status.authentication != 1){
        // auth in progress or failed
        if(dn.status.authorization == -1)
            s = "Authorization required...";
        else if(dn.status.popup_active)
            s = "Login/authenticate with popup...";
        else
            s = "Authenticating...";
    } else if (dn.the_file.file_id){
        // a file is/will be loaded...
        if (dn.status.file_meta === 1 && dn.status.file_body === 1){
            s = dn.the_file.title;
            var extra = [];
            if(dn.the_file.is_read_only)
                extra.push("read-only");
            if(dn.the_file.is_shared)
                extra.push("shared");
            if(dn.status.file_sharing == -1)
                extra.push("sharing status unknown");
            if(!dn.the_file.is_pristine)
                extra.push("unsaved changes");
            if(extra.length)
                s += "\n[" + extra.join(', ') + "]"; 
        }else if(dn.status.file_meta === 0 && dn.status.file_body === 0)
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
        else // both -1
            s = "Failed to load file:\n" + dn.the_file.file_id;
    } else {
        // no file to load
        s = "ex nihilo omnia...";
    }

    text_multi(dn.el.widget_text, s, true);
}

dn.show_error = function(message){
    console.log(message); //it's just useful to do this too
    text_multi(dn.el.widget_error_text, message,true);
    dn.el.widget_error.style.display = '';
    css_animation(dn.el.the_widget, 'shake', function(){
        dn.el.widget_error.style.display = 'none';
    }, dn.error_delay_ms);
};

dn.set_drive_link_to_folder = function(){
    var els = document.getElementsByClassName('link_drive');
    var href = dn.the_file.folder_id ? 
                'https://drive.google.com/#folders/' + dn.the_file.folder_id 
                : 'https://drive.google.com';
    for(var ii=0; ii<els.length; ii++)
        div_as_link(els[ii], href);
}


// ############################
// Settings stuff
// ############################

dn.get_settings_from_cloud = function() {
    return;
  gapi.drive.realtime.loadAppDataDocument(
  function(doc) {
    var old_temp_g_settings = dn.g_settings;
    dn.g_settings = doc.getModel().getRoot();
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
    
    var existingKeys = dn.g_settings.keys();
    dn.g_settings.addEventListener(gapi.drive.realtime.EventType.VALUE_CHANGED, dn.settings_changed);
    console.log('Applying settings from cloud...')
    for(var s in dn.default_settings)
        if(s in old_temp_g_settings.getKeeps())
            dn.g_settings.set(s,old_temp_g_settings.get(s));
        else if(existingKeys.indexOf(s) == -1)
            dn.g_settings.set(s,dn.default_settings[s]);
        else if(JSON.stringify(old_temp_g_settings.get(s)) !== JSON.stringify(dn.g_settings.get(s)))
            dn.settings_changed({property:s, newValue:dn.g_settings.get(s)});// the gapi doesn't automatically trigger this on load
    
    //Check lastDNVersionUsed at this point - by default it's blank, but could also have an out-of-date value
    if(dn.g_settings.get('lastDNVersionUsed') != dn.version_str){
        dn.g_settings.set('pane', 'pane_first_time_info');
        dn.g_settings.set('lastDNVersionUsed', dn.version_str);
    }
  },
  null,
  function(resp){
        console.log("g_settings error");
        console.dir(arguments);
        if ((resp.type && resp.type == "token_refresh_required") || resp.error.code == 401) //not sure if it has an error.code field but it does seem to have a type field
            dn.reauth(function(){console.log("reauthed triggered by g_settings")}); //no real callback here, I think the realtime api somehow disovers that we're back in buisiness
    })

}

dn.load_default_settings = function(){
  //Lets show the user either the defualt settings or the 
  //ones last used on this browser (restricted to impersonal settings only)

  dn.g_settings = (function(){ //mock realtime model to be used until the real model is initialised
      var ob = {};
      var keeps = {}
      return {get: function(k){return ob[k]}, 
              set: function(k,v){ob[k] = v;
                                 dn.settings_changed({property: k, newValue: v});
                                 },
              keep: function(k){keeps[k] = true},
              getKeeps: function(){return keeps;}};
                                 
  })();

  dn.status.local_settings = 0;
  try{
    console.log('Loading default/localStorage settings...');
    for(var s in dn.default_settings)
    if(dn.impersonal_settings_keys.indexOf(s) == -1 || !localStorage || !localStorage["g_settings_" +s])
        dn.g_settings.set(s,dn.default_settings[s]);
    else
        dn.g_settings.set(s,JSON.parse(localStorage["g_settings_" + s]));
  }catch(err){
      if(localStorage) 
        localStorage.clear();
      console.log("Failed to load defaults/localStorage settings.  Have cleared localStorage cache.")
  }
  dn.status.local_settings = 1;
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
                dn.theme_drop_down.SetInd(dn.theme_drop_down.IndexOf(new_value), true);
                break;
            case "fontSize":
                var scrollLine = dn.get_scroll_line();
                dn.el.font_size_text.textContent = new_value.toFixed(1);
                dn.editor.setFontSize(new_value + 'em')    
                dn.editor.scrollToLine(scrollLine);
                break;
            case "wordWrap":
                var s = dn.editor.getSession();
                var scrollLine = dn.get_scroll_line();
                s.setUseWrapMode(new_value[0]);
                s.setWrapLimitRange(new_value[1],new_value[2]);
                 dn.editor.scrollToLine(scrollLine);
                if(!new_value[0])
                    dn.el.word_wrap_off.classList.add('selected');
                else
                    dn.el.word_wrap_off.classList.remove('selected');
                if(new_value[0] && !new_value[1])
                    dn.el.word_wrap_edge.classList.add('selected');
                else
                    dn.el.word_wrap_edge.classList.remove('selected');
                if(new_value[0] && new_value[1])
                    dn.el.word_wrap_at.classList.add('selected');
                else
                    dn.el.word_wrap_at.classList.remove('selected');

                break;
            case "wordWrapAt":
                dn.el.word_wrap_at_text.textContent = new_value;
                var curWrap = dn.g_settings.get('wordWrap');
                if(curWrap[1] && curWrap[1] != new_value)
                    dn.g_settings.set('wordWrap',[1,new_value,new_value]);
                dn.editor.setPrintMarginColumn(new_value);
                break;
            case "showGutterHistory":
                var s = dn.editor.getSession(); 
                if(new_value){
                    dn.el.gutter_history_show.classList.add('selected')
                    dn.el.gutter_history_hide.classList.remove('selected');
                }else{
                    var h = dn.change_line_history;
                    for(var i=0;i<h.length;i++)if(h[i])
                        s.removeGutterDecoration(i,h[i]<0 ? dn.change_line_classes_rm[-h[i]] : dn.change_line_classes[h[i]]);
                    dn.change_line_history = []; 
                    dn.el.gutter_history_hide.classList.add('selected')
                    dn.el.gutter_history_show.classList.remove('selected');
                }
                break;
            case "newLineDefault":
                dn.apply_newline_choice();
                break;
            case "historyRemovedIsExpanded":
                dn.revision_setis_expaned(new_value);
                break;
            case "softTabN":
            case "tabIsHard":          
                dn.apply_tab_choice(); 
                break;
            case 'pane_open':
                dn.open_close_widget(new_value)
                if(dn.g_settings.keep)
                    dn.g_settings.keep('pane_open');
                break;
            case 'pane':
                dn.show_pane(document.getElementById(new_value));
                if(dn.g_settings.keep)
                    dn.g_settings.keep('pane');
                break; 
            case 'find_regex':
                if(new_value)
                    dn.el.find_button_regex.classList.add('selected');
                else
                    dn.el.find_button_regex.classList.remove('selected');
                if(dn.g_settings.get('pane') === 'pane_find' && dn.g_settings.get('pane_open'))
                    dn.do_find();
                break;
            case 'find_whole_words':
                if(new_value)
                    dn.el.find_button_whole_words.classList.add('selected');
                else
                    dn.el.find_button_whole_words.classList.remove('selected');
                if(dn.g_settings.get('pane') === 'pane_find' && dn.g_settings.get('pane_open'))
                    dn.do_find();
                break;
            case 'find_case_sensitive':
                if(new_value)
                    dn.el.find_button_case_sensitive.classList.add('selected');
                else
                    dn.el.find_button_case_sensitive.classList.remove('selected');
                if(dn.g_settings.get('pane') === 'pane_find' && dn.g_settings.get('pane_open'))
                    dn.do_find();
                break;
        }
    }catch(err){
        console.log("Error while uptating new settings value.")
        console.dir(e);
        console.dir(err);
    }
}


// ############################
// Font size stuff
// ############################

dn.font_size_decrement_click = function(){
    var font_size = dn.g_settings.get('fontSize');
    font_size -= dn.font_size_increment;
    font_size = font_size  < dn.min_font_size ? dn.min_font_size: font_size;
    dn.g_settings.set('fontSize', font_size);
}

dn.font_size_increment_click = function(){
    var font_size = dn.g_settings.get('fontSize');
    font_size += dn.font_size_increment;
    font_size = font_size  > dn.max_font_size ? dn.max_font_size:font_size;
    dn.g_settings.set('fontSize', font_size);
}



// ############################
// Tab stuff
// ############################
// Note that there is a whitespace extension for ace but it doesn't look that mature and we actually have slightly different requirements here.

dn.detect_tab = function(str){    
    dn.the_file.tab_detected = (function(){ //no need to use a self-executing function here, just lazy coding....
        //This function returns an object with a field "val" that takes one of the folling values:
        // none: no indents detected at all
        // mixture: no strong bias in favour of spaces or tabs
        // tab: defintely tabs
        // spaces: definitely space. In this case extra fields are provied....
        //   n: number of spaces
        //   isDefault: true if the default nSpaces value was used as part of the decision making process
        //   threshold: this takes one of three values:
        //          strong: the largest n over threshold was used
        //          weak: no n was over the strong threshold, but the default n was over the weak threshold
        //          failed: no idea what n is, so just use default
    
        var lines = dn.editor.session.getLines(0, 1000);    
        var indents = lines.map(function(str){
                        return str.match(/^\s*/)[0];
                      });
        indents = indents.filter(function(str){return str !== '';});
        
        if(!indents.length)
            return dn.show_tab_status({val: "none"});
            
        //TODO: if first thousand lines happen to have few indents it may be worth checking further down.
        
        var stats = indents.reduce(function(stats,str){
           if(str.indexOf('\t') > -1)
              if(str.indexOf(' ') > -1)
                stats.nWithMixture++;
              else
                stats.nWithOnlyTabs++;
           else
               stats.spaceHist[str.length] = (stats.spaceHist[str.length] || 0) + 1;   
            return stats;
        },{nWithOnlyTabs: 0,spaceHist: [],nWithMixture: 0});
            
        stats.nSamp = indents.length;
        stats.nWithOnlySpaces = stats.nSamp - stats.nWithMixture - stats.nWithOnlyTabs;
        
        console.dir(stats);
            
        if(stats.nWithOnlyTabs/stats.nSamp >= dn.detect_tabs_tabs_frac)
            return dn.show_tab_status({val: "tab"});
    
        if(stats.nWithOnlySpaces/stats.nSamp < dn.detect_tabs_spaces_frac)
            return dn.show_tab_status({val: "mixture"});
    
        stats.spaceModHist = [];
        var s;
        for(s=dn.min_soft_tab_n;s<=dn.max_soft_tab_n;s++){
            var m = 0;    
            for(var i=s;i<stats.spaceHist.length;i+=s)
                m += stats.spaceHist[i] !== undefined ? stats.spaceHist[i] : 0;
            stats.spaceModHist[s] = m;
        }
        
        for(s=dn.max_soft_tab_n;s>=dn.min_soft_tab_n;s--)
            if(stats.spaceModHist[s]/stats.nWithOnlySpaces > dn.detect_tabs_n_spaces_frac)
                break;
                
        if(s < dn.min_soft_tab_n){
            // nothing was over threshold, but rather than give up lets use a weaker threshold on the default space count
            var defaultNSpaces = dn.g_settings.get('softTabN');    
            if(stats.spaceModHist[defaultNSpaces]/stats.nWithOnlySpaces > dn.detect_tabs_n_spaces_frac_for_default)
                return dn.show_tab_status({val: 'spaces', n: defaultNSpaces, isDefault: true, threshold: "weak"});
            else
                return dn.show_tab_status({val: "spaces", n: defaultNSpaces, isDefault: true, threshold: "failed"});
        }else{
            // s is the index of the last element in the spaceModHist array which is over threshold
                return dn.show_tab_status({val: "spaces", n: s, isDefault: false, threshold: "strong"});
        }
    })();
}


dn.show_tab_status = function(d){
    var str;
    var defaultStr = "";
    if(dn.g_settings.get("tabIsHard"))
        defaultStr = "hard tabs";
    else
        defaultStr = dn.g_settings.get("softTabN") + " spaces";
    
    switch(d.val){
        case 'none':
            str = "no indentations detected, default is " + defaultStr;
            break;
        case 'mixture':
            str = "detected mixture of tabs, default is " + defaultStr;
            break;
        case 'tab':
            str = "hard tab indentation detected";
            break;
        case "spaces":
            switch(d.threshold){
                case 'strong':
                    str = "detected soft-tabs of " + d.n + " spaces";
                    break;
                case 'weak':
                    str = "detected close match to default of " + d.n + " spaces";
                    break;
                case 'failed':
                    str = "detected soft-tabs, assuming default " + d.n + " spaces";
                    break;
            }
    }
    
    dn.el.file_tab_info.textContent = "(" + str +")";
    return d;
}

dn.apply_tab_choice = function(){
    var defaultTabIsHard = dn.g_settings.get('tabIsHard');
    var defaultSoftTabN = dn.g_settings.get('softTabN');               
                
    var d;
    var isHard;
    var nSpaces;
    var isDetected;
    
    dn.detect_tab();   
    if(dn.the_file.custom_props.tabs == "detect"){
        d = dn.the_file.tab_detected;             
        isDetected = true
    }else{
        try{
            d = JSON.parse(dn.the_file.custom_props.tabs);
        }catch(err){
            d = {val: "none"};
        }
    }
    switch(d.val){
        case 'none':
        case 'mixture':
            isHard = defaultTabIsHard;
            nSpaces = defaultSoftTabN;
            break;
        case 'tab':
            isHard = true;
            nSpaces = d.n || defaultSoftTabN;
            break;
        case 'spaces':
            isHard = false;
            nSpaces = d.n;
    }
    
    
    if(isHard){
        dn.editor.session.setUseSoftTabs(false);
    }else{
        dn.editor.session.setUseSoftTabs(true);
        dn.editor.session.setTabSize(nSpaces);
    }
    
    dn.el.tab_soft_text.textContent = defaultSoftTabN;
    if(defaultTabIsHard){
        dn.el.tab_hard.classList.add('selected');
        dn.el.tab_soft.classList.remove('selected');
    }else{
        dn.el.tab_soft.classList.add('selected');
        dn.el.tab_hard.classList.remove('selected');
    }
    
    
    dn.el.file_tab_detect.classList.remove('selected');
    dn.el.file_tab_hard.classList.remove('selected');
    dn.el.file_tab_soft.classList.remove('selected');
    if(isDetected){
        dn.el.file_tab_detect.classList.add('selected');
        dn.el.file_tab_soft_text.textContent = nSpaces;
    }else{
        if(d.val == "tab")
            dn.el.file_tab_hard.classList.add('selected');
        else
            dn.el.file_tab_soft.classList.add('selected');
        dn.el.file_tab_soft_text.textContent = nSpaces;
    }     


}

dn.set_file_tabs_to_soft_or_hard = function(val,delta){
    var f = dn.the_file;
    var current = f.custom_props.tabs;
    if(current == "detect"){
        current = f.tab_detected;
        if(current.val == 'none' || current.val == "mixture")
            current = { val: dn.g_settings.get('tabIsHard') ? "tab" : "spaces",
                        n: dn.g_settings.get('softTabN')};
    }else{
        try{
            current = JSON.parse(current);
        }catch(err){
            console.log("JSON.parse failed in SetFileTabsToSoftOrHard with current=" + current)
            return;
        }
    }
    var newT = {val: val, n: current.n + delta};
    dn.set_property("tabs",JSON.stringify(newT));
}
// ############################
// Syntax stuff
// ############################

dn.show_syntax_status = function(d){
    var str = "detected " + d.syntax + " from file extension";
    //TODO: if we improve upon DetectSyntax will need to add stuff here
    dn.el.file_ace_mode_info.textContent = "(" + str + ")";
    return d.syntax;
}
dn.detect_syntax = function(){
    dn.the_file.syntax_detected = (function(){ //no need to use self-ex-func here, just laziness...
        //TODO: improve upon this
        var title = dn.the_file.title || "untitled.txt";
        var mode  = require("ace/ext/modelist").getModeForPath(title);
        dn.the_file.syntax_detected = mode.caption;
        dn.show_syntax_status({syntax: dn.the_file.syntax_detected});
        return mode;
    })();
}

dn.apply_syntax_choice = function(){
    dn.detect_syntax();
    if(dn.the_file.custom_props["aceMode"] == "detect"){
        dn.set_syntax(dn.the_file.syntax_detected);
        dn.el.file_ace_mode_detect.classList.add('selected');
        dn.syntax_drop_down.SetSelected(false);
    }else{
        dn.set_syntax(dn.the_file.custom_props["aceMode"])
        dn.el.file_ace_mode_detect.classList.remove('selected');
        dn.syntax_drop_down.SetSelected(true);
    }
}

dn.get_current_syntax_name = function(){
    try{
        var modesArray = require("ace/ext/modelist").modesByName;
        return modesArray[dn.editor.session.getMode().$id.split('/').pop()].caption
    }catch(e){
        console.log("ERROR in GetCurrentSyntaxName...");
        console.dir(e);
        return "Text";
    }  
}

dn.set_syntax = function(val){

    var modesArray = require("ace/ext/modelist").modes;
    var mode;
    var ind;
    
    if(typeof val == "number"){
        //val is index into mdoes array
        mode = modesArray[val].mode;
        ind = val;
    }else if(modesArray.indexOf(val) > -1){
        //val is an element of the modelist array
        mode = val.mode;
        ind = modesArray.indexOf(val);
    }else{
        //val is caption of mode in modes array
        for(ind=0;ind<modesArray.length;ind++)if(modesArray[ind].caption == val){
            mode = modesArray[ind].mode;
            break;
        }    
    }
    
    if(dn.syntax_drop_down)
        dn.syntax_drop_down.SetInd(ind,true);
    dn.editor.getSession().setMode(mode);
}

dn.create_theme_menu = function(){
    var themes = require('ace/ext/themelist');
    var theme_drop_down = new DropDown(Object.keys(themes.themesByName));
    theme_drop_down.addEventListener("change",function(){
        dn.g_settings.set("theme",theme_drop_down.GetVal());
    })
    theme_drop_down.addEventListener("blur",function(){
       dn.focus_editor();
    })
    return theme_drop_down;
}

dn.create_syntax_menu = function(){
    var modes = require("ace/ext/modelist").modes;
    
    var syntax_drop_down = new DropDown(modes.map(function(m){return m.caption;}));
    
    syntax_drop_down.addEventListener("click", dn.read_only_bail);
    
    syntax_drop_down.addEventListener("click",function(){
        dn.set_property("aceMode",syntax_drop_down.GetVal());
    })
    syntax_drop_down.addEventListener("change",function(){
        dn.set_property("aceMode",syntax_drop_down.GetVal());
    })
    syntax_drop_down.addEventListener("blur",function(){
       dn.focus_editor();
    })
    return syntax_drop_down;
}

// ############################
// File details stuff
// ############################
dn.read_only_bail = function(e){
    if(dn.the_file.is_read_only){
        dn.show_error("The file is read-only, so you cannot change its properties.");
        e.stopImmediatePropagation();
       dn.focus_editor();
    }
}
dn.create_file_details_tool = function(){
    var els = [dn.el.details_title_text,
               dn.el.details_description_text,
               dn.el.file_newline_detect,
               dn.el.file_newline_windows,
               dn.el.file_newline_unix,
               dn.el.file_tab_detect,
               dn.el.file_tab_soft,
               dn.el.file_tab_hard,
               dn.el.file_ace_mode_detect];
    for(var ii=0; ii< els.length; ii++)
        els[ii].addEventListener("click",dn.read_only_bail); //If file is read only, ReadOnlyBail will prevent the click handlers below from running.
        
    //Title change stuff
    dn.el.details_title_text.addEventListener('click', function(){                
            dn.el.details_title_text.style.display = 'none';
            dn.el.details_title_input.style.display = '';
            dn.el.details_title_input.focus();
            dn.el.details_title_input.select();
    });
    dn.el.details_title_input.addEventListener("blur", function(){
            dn.el.details_title_input.style.display = 'none';
            dn.el.details_title_text.style.display = '';
            var new_val = dn.el.details_title_input.value;
            if(new_val == dn.the_file.title)
                return;
            dn.the_file.title = new_val
            dn.show_file_title(); //includes showStatus
            dn.apply_syntax_choice();
            dn.save_file_title();
           dn.focus_editor();
    });
    dn.el.details_title_input.addEventListener('keyup', function(e){
            if(e.which == WHICH.ENTER)
                dn.el.details_title_input.trigger('blur');
    });
    dn.el.details_title_input.addEventListener('keydown', function(e){
        if(e.which == WHICH.ESC){
            dn.el.details_title_input.value = dn.the_file.title;
            dn.el.details_title_input.trigger('blur');
            dn.ignore_escape = true; //stops ToggleWidget
        }
    });

    // File action buttons stuff
    dn.el.button_save.addEventListener('click', dn.save_content);
    dn.el.button_print.addEventListener('click', dn.do_print);
    dn.el.button_share.addEventListener('click', dn.do_share);
    dn.el.button_history.addEventListener('click', dn.start_revisions_worker);

    // Description stuff
    dn.el.details_description_text.addEventListener('click', function(){            
            dn.el.details_description_text.style.display = 'none';
            dn.el.details_description_input.style.display = '';
            dn.el.details_description_input.focus();
    });
    dn.el.details_description_input.addEventListener("blur", function(){
            dn.el.details_description_input.style.display = 'none';
            dn.el.details_description_text.style.display = '';
            var new_val = dn.el.details_description_input.value;
            if(dn.the_file.description === new_val)
                return;
            dn.the_file.description = new_val;
            dn.show_description();
            dn.save_file_description();
           dn.focus_editor();
    });
    dn.el.details_description_input.addEventListener('keydown',function(e){
            if(e.which == WHICH.ESC){
                dn.el.details_description_input.value = dn.the_file.description;
                dn.el.details_description_input.trigger('blur');
                dn.ignore_escape = true;
            }
    });
        
    // File custom props stuff
    dn.el.file_newline_detect.addEventListener('click', function(){
         dn.set_property("newline","detect");
        dn.focus_editor();      
    });
    dn.el.file_newline_windows.addEventListener('click', function(){
         dn.set_property("newline","windows");
        dn.focus_editor();
        });
    dn.el.file_newline_unix.addEventListener('click', function(){
         dn.set_property("newline","unix");
        dn.focus_editor();
        });
    dn.el.file_tab_detect.classList.add('selected');
    dn.el.file_tab_detect.addEventListener('click', function(){
        dn.set_property("tabs","detect");
       dn.focus_editor();
    });
    dn.el.file_tab_soft.addEventListener('click', function(){
        dn.set_file_tabs_to_soft_or_hard("spaces",0);
       dn.focus_editor();
    });
    document.getElementById('file_tab_soft_dec').addEventListener('click', function(){
        dn.set_file_tabs_to_soft_or_hard("spaces",-1);
       dn.focus_editor();
    });
    document.getElementById('file_tab_soft_inc').addEventListener('click', function(){
        dn.set_file_tabs_to_soft_or_hard("spaces",+1);
       dn.focus_editor();
    })
    dn.el.file_tab_hard.addEventListener('click', function(){
        dn.set_file_tabs_to_soft_or_hard("tab",0);
       dn.focus_editor();
    });
    dn.el.file_ace_mode_detect.addEventListener('click', function(){
       dn.set_property("aceMode","detect"); 
    });
}

dn.save_file_description = function(){
    if(dn.the_file.is_brand_new){
        dn.save_new_file(); 
        return;
    }
    
    dn.save_file(dn.the_file.file_id, {description: dn.the_file.description}, undefined, 
                $.proxy(dn.save_done,{description: ++dn.the_file.generation_to_save.description}))
    dn.show_status();
    return;
    
}

dn.save_file_title = function(){
    if(dn.the_file.is_brand_new){
        dn.save_new_file(); 
        return;
    }
    //TODO: mime-type IMPORTANT!

    dn.save_file(dn.the_file.file_id, {title: dn.the_file.title}, undefined, 
                $.proxy(dn.save_done,{title: ++dn.the_file.generation_to_save.title}))
    dn.show_status();    
}

dn.show_file_title = function(){
    dn.el.details_title_text.textContent = 'Title: ' + dn.the_file.title;
    dn.el.details_title_input.value = dn.the_file.title;
    document.title = (dn.the_file.is_pristine ? "" : "*") + dn.the_file.title;
    dn.show_status();
}

dn.show_description = function(){
    text_multi(dn.el.details_description_text, 'Description: ' + dn.the_file.description,true);
    dn.el.details_description_input.value = dn.the_file.description;
}

// ############################
// Save stuff
// ############################

dn.save_content = function(){
    if(dn.the_file.is_brand_new){
        dn.save_new_file(); 
        return false;
    }
    
    if(!dn.the_file.is_pristine){
        dn.the_file.data_to_save.body = dn.editor.getSession().getValue();
        dn.the_file.generation_to_save.body++;
        dn.el.ace_content.setAttribute('saving',true);
        dn.the_file.is_saving = true;
        dn.the_file.is_pristine = true;
    }
    
    dn.show_file_title(); //includes a showstatus calls
    dn.do_save();
    return false;
}

dn.do_save = function (){
    
    if(dn.the_file.is_read_only){
        dn.show_error("Cannot save read-only file.");
        return false;
    }
    
    if(!(dn.the_file.data_to_save.body || dn.the_file.data_to_save.title || dn.the_file.data_to_save.description)){
        dn.show_error("No changes since last save.");
        return false;
    }

    var gens = {};
    var body, meta;
    if(dn.the_file.data_to_save.body){
        body = dn.the_file.data_to_save.body;
        gens.body = dn.the_file.generation_to_save.body;
    }
    if(dn.the_file.data_to_save.title || dn.the_file.data_to_save.description){
        meta = {};
        if(dn.the_file.data_to_save.title){
            meta.title = dn.the_file.data_to_save.title;
            gens.title = dn.the_file.generation_to_save.title;
        }
        if(dn.the_file.data_to_save.description){
            meta.description = dn.the_file.data_to_save.description; 
            gens.description = dn.the_file.generation_to_save.description;
        }
    }
    dn.save_file(dn.the_file.file_id, meta, body, $.proxy(dn.save_done,gens))
    return false;
}

dn.save_done = function(resp){
    if(resp.error){
        if(resp.error.code == 401){
            dn.reauth(dn.do_save); //will make use of dn.the_file.data_to_save and generation_to_save once auth is done.
        }else{
            var failures = []
            if(this.body && this.body == dn.the_file.generation_to_save.body){
                failures.push("body");
                dn.the_file.is_saving = false;
                dn.the_file.is_pristine = false;
                dn.show_file_title();
                dn.el.ace_content.removeAttribute('saving');
                dn.the_file.data_to_save.body = null;
            }
            if(this.title && this.title == dn.the_file.generation_to_save.title)
                failures.push("title");
            if(this.description && this.description == dn.the_file.generation_to_save.description)
                failures.push("description");
            
            if(failures.length){//it's possible that all parts of the save request have since been superceded, so we can ignore this failure
                dn.show_error("Failed to save " +  oxford_comma(failures) + ". Error #" + resp.error.code + (resp.error.message? "\n" + resp.error.message : ""));
                console.dir(resp);
            }            
        }
    }else{//success...
        if(this.body && this.body == dn.the_file.generation_to_save.body){
            dn.the_file.is_saving = false;
            dn.el.ace_content.removeAttribute('saving');
            dn.the_file.ext = resp.fileExtension;
            dn.g_settings.set('ext',resp.fileExtension);
            dn.the_file.data_to_save.body = null;
            
            if(dn.the_file.is_brand_new)
                dn.saved_new_file(resp); 
        }
        if(this.title && this.title == dn.the_file.generation_to_save.title){
            dn.the_file.data_to_save.title = null;
        }
        if(this.description && this.description == dn.the_file.generation_to_save.description){
            dn.the_file.data_to_save.description = null;
        }

    }
    dn.show_status();
}

dn.save_file = function (fileId, fileMetadata, fileText, callback) {
    //if fileId is null then a new file is created (can set fileMetadata.parentNodes = [parentFolderId])
    //fileMetadata or fileText can be null.
    //See https://developers.google.com/drive/v2/reference/files/insert - Request Body for valid metaData.

    //build a multipart message body
    var boundary = dn.make_boundary();
    var delimiter = "\r\n--" + boundary + "\r\n";
    var close_delim = "\r\n--" + boundary + "--";

    var messageBody = delimiter +
                'Content-Type: application/json\r\n' +
                '\r\n' + JSON.stringify(fileMetadata ? fileMetadata : {}); //note than in the multipart message upload you must provide some json metadata, even if it's empty.

    if(fileText){ 
        messageBody += delimiter +
                'Content-Type: application/octet-stream\r\n' +
                'Content-Transfer-Encoding: base64\r\n' +
                '\r\n' + btoa(unescape(encodeURIComponent(fileText))); //javascript strings are utf16 encoded, but btoa only accespts ASCII, somehow the two extra functions here smooth over this problem and produce the expected result at the server end.
    }
    messageBody += close_delim;

    var request = gapi.client.request({
        path: '/upload/drive/v2/files/' + (fileId ? fileId : ""),
        method: (fileId? 'PUT' : 'POST'),
        params: {'uploadType': 'multipart'},
        headers: {'Content-Type': 'multipart/mixed; boundary="' + boundary + '"'} ,
        body:   messageBody}
        );

    request.execute(callback);
}

dn.make_boundary = function(){
    //for MIME protocol, require a boundary that doesn't exist in the message content.
    //we could check explicitly, but this is essentially guaranteed to be fine:
    // e.g. "13860126288389.206091766245663"
    return (new Date).getTime() + "" + Math.random()*10;
}


// ############################
// Print stuff
// ############################

dn.do_print = function(){
    var content = dn.editor.session.doc.getAllLines();
    var html = Array(content.length);

    for(var i=0; i<content.length;i++)
        html[i] = "<li><div class='printline'>" + dn.line_tohtml(i) + '</div></li>';

    var printWindow = window.open('','');
    printWindow.document.writeln(
            "<html><head><title>" + dn.the_file.title 
            + "</title></head><style>"
            + ace.require('ace/theme/' + dn.g_settings.get('theme')).cssText + "\nbody{font-size:"
            + dn.g_settings.get('fontSize') *14 +"px; white-space:pre-wrap;" + 
            "font-family:'Monaco','Menlo','Ubuntu Mono','Droid Sans Mono','Consolas',monospace;}"
            + "\nli{color:gray;}\n.printline{color:black;}</style>" + 
            "<body class='ace-"+ dn.g_settings.get('theme') +"'><ol id='content'>" + 
            html.join("") +
            "</ol></body></html>");
    printWindow.print();
    return false;
}

dn.line_tohtml = function (n){
    var printLayer = Object.create(ace.require('ace/layer/text').Text.prototype); 
    var tokens  = dn.editor.getSession().getTokens(n);
    var html = [];
    var screenColumn = 0;
    for (var i = 0; i < tokens.length; i++) {
       var token = tokens[i];
       var value = token.value.replace(/\t/g,'   ');//TODO:deal with tabs properly
       if(value)
           printLayer.$renderToken(html, 0, token, value);
    }
    return html.join('').replace(/&#160;/g,' ');
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
       while(dn.g_clipboard.length >dn.clipboard_max_length) //same as on copy
         dn.g_clipboard.remove(0);
    }
    if(dn.clipboard_info_timer)
        clearTimeout(dn.clipboard_info_timer);

    dn.clipboard_info_timer = setTimeout(function(){
        dn.clipboard_info_timer = null;
        dn.el.pane_clipboard.style.display = '';
    },dn.clipboard_info_delay);
}

dn.on_copy = function(text){
    if (dn.g_clipboard === undefined)
        return;
    
    dn.g_clipboard.push(text);
    while(dn.g_clipboard.length >dn.clipboard_max_length)
        dn.g_clipboard.remove(0);
}

dn.create_clipboard_tool = function(){
    dn.el.pane_clipboard = document.getElementById('pane_clipboard');
    dn.el.button_clear_clipboard.addEventListener('click', function(){
            dn.g_clipboard.clear();
    });
    dn.el.button_clear_find_replace.addEventListener('click', function(){
            dn.g_find_history.clear();
    });
}


// ############################
// New file stuff
// ############################

dn.do_new = function(){
    //TODO: this could actually just be a link, updated in settingschanged-ext
    var base = window.location.href.match(/^https?:\/\/[\w-.]*\/\w*/)[0];
    window.open(base + "?state=" + JSON.stringify({
                action: "create",
                folderId: dn.the_file.folder_id ? dn.the_file.folder_id : '',
                ext: dn.g_settings.get('ext')}),"_blank");
    return false;
}

dn.create_new_tool = function(){
    dn.el.menu_new.addEventListener('click', dn.do_new);
}

dn.create_file = function(){
    dn.apply_syntax_choice();
    dn.the_file.is_brand_new = true;
    dn.show_file_title();
    dn.show_description();
    dn.apply_newline_choice();
    dn.apply_tab_choice();
    dn.g_settings.set("pane","pane_file");  
}

dn.guess_mime_type = function(){
    // we set the mimeType on new files, it's too complicated to try and guess it otherwise (at least for now)
    if(dn.the_file.loaded_mime_type)
        return dn.the_file.loaded_mime_type;
    var plain = "text/plain";
    var ext = dn.the_file.title.match(/\.[0-9a-z]+$/i);

    if(!ext)
        return plain;
    else
        ext = ext[0].substr(1);
    
    return (ext in dn.ext_to_mime_type)? dn.ext_to_mime_type[ext] : plain;

}

dn.save_new_file = function(){
    var f = dn.the_file;
    if(f.is_saving){
        dn.show_error("File is being created. Please wait.");
        return false;
    }
    var meta = {title: f.title, 
                description: f.description,
                mimeType: dn.guess_mime_type()};
    var parentId = f.folderId;
    if(parentId) 
        meta.parentNodes =[{id:[parentId]}];
    f.data_to_save.body = dn.editor.getSession().getValue();
    f.data_to_save.title = meta.title;
    f.data_to_save.description = meta.description;
    var gens = {title: ++f.generation_to_save.title, description: ++f.generation_to_save.description,body: ++f.generation_to_save.body};
    f.is_saving = true;
    f.is_pristine = true;
    dn.show_file_title();
    dn.el.ace_content.setAttribute('saving', true);
    dn.show_status();
    dn.save_file(null, meta, f.data_to_save.body, $.proxy(dn.save_done,gens));
}

dn.saved_new_file = function(resp){
    dn.the_file.is_brand_new = false;
    dn.the_file.file_id = resp.id;
    dn.the_file.is_shared = resp.shared;
    dn.status.file_sharing = 1;
    dn.the_file.ext = resp.fileExtension;
    history.replaceState({},dn.the_file.title,
            window.location.href.match(/^https?:\/\/[\w-.]*\/\w*/)[0] +
                "?state={\"action\":\"open\",\"ids\":[\"" + dn.the_file.file_id + "\"]}");
    dn.set_drive_link_to_folder();
    dn.save_all_file_properties();
}

// ############################
// Scrolling stuff
// ############################

dn.save_scroll_line = function(){
    dn.patch_property(dn.the_file.file_id, 
                    "ScrollToLine",
                    dn.get_scroll_line(),
                    'PUBLIC',null);
}

dn.get_scroll_line = function(){
    return  dn.editor.getSession().screenToDocumentPosition(dn.editor.renderer.getScrollTopRow(),0).row;
}

// ############################
// Load stuff
// ############################


dn.load_file = function(flag){
    //we assume that we only ever load one fileid per page load
    var file_id = dn.the_file.file_id; 

    dn.show_status();

    /*TODO dn.reauth */
    
    dn.status.file_meta = 0;
    var promise_get_meta = Promise.resolve(
        gapi.client.request({
            'path': '/drive/v3/files/' + file_id,
            'params':{'fields': 'name,mimeType,description,parents,capabilities,fileExtension,shared'}}))
        .then(dn.load_file_got_meta_data, function(err){
            dn.show_error(err.result.error.message);
            dn.status.file_meta = -1;
            dn.show_status();
            throw err;
        })

    dn.status.file_body = 0;
    var promise_get_body = Promise.resolve(
        gapi.client.request({
            'path': '/drive/v3/files/' + file_id,
            'params':{'alt': 'media'}
        }))            
        .then(dn.load_file_got_file_body, function(err){
            dn.show_error(err.result.error.message);
            dn.status.file_body = -1;
            dn.show_status();
            throw err;
        });

    
    dn.pr_the_file = Promise.all([promise_get_meta, promise_get_body])
    .then(function(){ 
        //success
    }, function(){
        // failure
        document.title = "Drive Notepad";
        dn.g_settings.set('pane', 'pane_help');
    })
    
}

dn.load_file_got_meta_data = function(resp) {
    if (resp.error)
        throw Error(resp.error);
    dn.the_file.title = resp.result.name;
    dn.the_file.description = resp.result.description || '';
    dn.show_description();
    dn.the_file.ext = resp.result.fileExtension
    dn.the_file.is_read_only = !resp.result.capabilities.canEdit;
    dn.the_file.is_shared = resp.result.shared; 
    dn.the_file.loaded_mime_type = resp.result.mimeType;
    if(resp.result.parents && resp.result.parents.length){
        dn.the_file.folder_id = resp.result.parents[0];
        dn.set_drive_link_to_folder();
    }
    dn.show_file_title(); //includes a showStatus call
    dn.status.file_meta = 1;
    dn.show_status();
} 

dn.load_file_got_file_body = function(resp){
    dn.show_status();
    dn.setting_session_value = true;
    dn.editor.session.setValue(resp.body);
    dn.setting_session_value = false;
    dn.apply_newline_choice(resp.body);
    dn.apply_syntax_choice();
    dn.apply_tab_choice(); 
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
        
    if(dn.the_file.is_pristine){
        dn.the_file.is_pristine = false;
        dn.show_file_title();
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
    if(!dn.the_file.is_pristine)
        return "If you leave the page now you will loose the unsaved " + (dn.the_file.is_brand_new ? "new " : "changes to ") + "file '" + dn.the_file.title + "'."
}


// ############################
// Properties stuff
// ############################
dn.property_updated = function(propKey,new_val){
    console.log("[file custom property]  " + propKey + ": " + new_val);
    switch(propKey){
        case "newline":
            dn.apply_newline_choice();
            break;
        case "tabs":            
            dn.apply_tab_choice();
            break;
        case "aceMode":
            dn.apply_syntax_choice();
            break;
    }
    
}

dn.load_default_properties = function(){
    for(var k in dn.default_custom_props)
        dn.set_property(k,dn.default_custom_props[k]);
}

dn.get_properties_from_cloud = function() {    
    // TODO:
    /*
    gapi.client.drive.properties.list({
    'fileId': dn.the_file.file_id
    }).execute(dn.got_all_file_properties);*/
}

dn.got_all_file_properties = function(resp){
    if(resp.items){
        dn.the_file.custom_prop_exists = {};
        for(var i=0;i<resp.items.length;i++){
            dn.the_file.custom_props[resp.items[i].key] = resp.items[i].value;
            dn.the_file.custom_prop_exists[resp.items[i].key] = true;
            dn.property_updated(resp.items[i].key,resp.items[i].value);
        }
    }
}

dn.save_all_file_properties = function(){
    //To be used after creating a file, in order to set any of the props which had been modified before saving it
    for(var k in dn.the_file.custom_props)
        dn.set_property(k,dn.the_file.custom_props[k]);    
}

dn.set_property = function(prop_name,new_val){

    var oldVal = dn.the_file.custom_props[prop_name]; 
    dn.the_file.custom_props[prop_name] = new_val;
    if(oldVal !== new_val)
        dn.property_updated(prop_name,new_val);

    if(!(gapi && gapi.drive && dn.the_file.file_id))
        return;

    var dummyCallback = function(){}; //TODO: may want to do some error handling or something
    
    if(dn.default_custom_props[prop_name] == new_val){ //note that this is true in particular when SetProperty is called within LoadDefaultProperties
        if(dn.the_file.custom_prop_exists[prop_name]){
             dn.the_file.custom_prop_exists[prop_name] = false;
             gapi.client.drive.properties.delete({ //DELTE the property, which does exist, but is no longer required because the value has been set to the default
                fileId: dn.the_file.file_id, propertyKey: prop_name, visibility: 'PUBLIC'
                }).execute(dummyCallback);
        }
        //if the property doesn't exist and it's just been set to the default then we don't need to do anything.
    }else{            
        if(dn.the_file.custom_prop_exists[prop_name] && oldVal !== new_val){
            gapi.client.drive.properties.patch({ //PATCH the property, which already exists
            fileId: dn.the_file.file_id, propertyKey: prop_name, visibility: 'PUBLIC', resource: {'value': new_val}
            }).execute(dummyCallback);
        }else{
            dn.the_file.custom_prop_exists[prop_name] = true; //INSERT the property, because it doesn't yet exist, we may be coming via dn.save_all_file_properties() above
            gapi.client.drive.properties.insert({
            'fileId': dn.the_file.file_id, 'resource': {key: prop_name, value: new_val, visibility: 'PUBLIC'}
            }).execute(dummyCallback)
        }
    }
}


// ############################
// Drag-drop stuff
// ############################
//TODO: this may have a few bugs since it's not been tested for a while

dn.document_drag_over = function (evt) {
    evt = evt.originalEvent;
    evt.stopPropagation();
    evt.preventDefault();
    if(!(dn.the_file.is_brand_new && dn.the_file.is_pristine)){
        evt.dataTransfer.dropEffect = 'none';
        if(dn.can_show_drag_drop_error){
            dn.show_error("File drag-drop is only permitted when the Drive Notpad page is displaying a new and unmodified file.")
            dn.can_show_drag_drop_error = false; //wait at least ERROR_DELAY_MS until displaying the error again
            setTimeout(function(){dn.can_show_drag_drop_error = true;},dn.error_delay_ms);
        }
        return;
    }
    evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
}
    
dn.document_drop_file = function(evt){
     if(!(dn.the_file.is_brand_new && dn.the_file.is_pristine))
        return;
        
   evt = evt.originalEvent;
   evt.stopPropagation();
   evt.preventDefault();
   
   var files = evt.dataTransfer.files;
   if(files.length > 1){
       dn.show_error("You cannot drag-drop multiple files onto the Drive Notepad page, only individual files.")
   }
   var file = files[0];
   dn.the_file.title = file.name;
   dn.create_file();
   dn.the_file.isReading_file_object = true;   
   dn.show_status();
   var r = new FileReader();
   r.onload = dn.dropped_file_read;
   r.readAsText(file);      
}

dn.dropped_file_read = function(e){
    dn.the_file.isReading_file_object = false;
    dn.editor.getSession().setValue(e.target.result);
    // Note we don't encolse the above in a dn.setting_session_value = true block so the change event will fire and set pristine to false and ShowStatus etc.
}

dn.focus_editor = function(){
   dn.editor.focus();
}
// ############################
// Page ready stuff
// ############################


dn.document_ready = function(e){

    // widget :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
    dn.el.the_widget = document.getElementById('the_widget');
    dn.el.widget_text = document.getElementById('widget_text');
    dn.el.widget_error_text = document.getElementById('widget_error_text');
    dn.el.widget_error = document.getElementById('widget_error');
    dn.el.widget_content = document.getElementById('widget_content');
    dn.el.the_widget.addEventListener('mousedown', dn.widget_mouse_down);
    translate(dn.el.the_widget, 0, 0);
    dn.el.the_widget.style.display = '';
    dn.el.widget_error.style.display = 'none';
    dn.el.widget_content.addEventListener('mousedown', stop_propagation);

    // editor :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
    var editor_el = document.getElementById('the_editor');
    editor_el.innerHTML = '';
    editor_el.addEventListener('contextmenu', function(e){
        dn.show_error("See the list of keyboard shortcuts for copy/paste, select-all, and undo/redo.")
    });
    dn.editor = ace.edit("the_editor");
    dn.el.ace_content = document.getElementsByClassName('ace_content')[0];
    dn.editor.on('focus', dn.blur_find_and_focus_editor)
    dn.editor.getSession().addEventListener("change", dn.on_change);
    dn.focus_editor();
    dn.editor.on("paste", dn.on_paste);
    dn.editor.on("copy", dn.on_copy);
    dn.editor.setAnimatedScroll(true);
    
    // widget menu ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
    dn.el.widget_menu = document.getElementById('widget_menu');
    dn.el.menu_open = document.getElementById('menu_open');
    dn.el.menu_find = document.getElementById('menu_find');
    dn.el.menu_help = document.getElementById('menu_help');
    dn.el.menu_file = document.getElementById('menu_file');
    dn.el.menu_general_settings = document.getElementById('menu_general_settings');
    dn.el.widget_menu.addEventListener('mousedown', stop_propagation);
    dn.menu_icon_from_pane_id = {}
    var els = dn.el.widget_menu.getElementsByClassName('widget_menu_wrapper');
    for(var ii=0; ii<els.length; ii++){
        els[ii].addEventListener("click",dn.focus_editor);
        els[ii].title = dn.menu_id_to_caption[els[ii].id];
        els[ii].innerHTML = "<div class='widget_menu_icon' id='icon_" + els[ii].id + "'></div>";
        var el_icon = els[ii].getElementsByClassName('widget_menu_icon')[0];
        dn.menu_icon_from_pane_id['pane_' + els[ii].id.substr(5)] = el_icon;
    }

     // pane file ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
    dn.el.pane_file = document.getElementById('pane_file');
    dn.el.details_title_input  = document.getElementById('details_file_title_input');
    dn.el.details_title_text = document.getElementById('details_file_title_text');
    dn.el.details_description_input  = document.getElementById('details_file_description_input');
    dn.el.details_description_text = document.getElementById('details_file_description_text');    
    dn.el.file_ace_mode_choose = document.getElementById('file_ace_mode_choose')
    dn.el.file_ace_mode_detect = document.getElementById('file_ace_mode_detect');
    dn.el.file_ace_mode_info = document.getElementById('file_ace_mode_info');
    dn.el.file_newline_detect = document.getElementById('file_newline_detect');
    dn.el.file_newline_windows = document.getElementById('file_newline_windows');
    dn.el.file_newline_unix = document.getElementById('file_newline_unix');
    dn.el.file_newline_info = document.getElementById('file_newline_info');
    dn.el.file_tab_detect = document.getElementById('file_tab_detect');
    dn.el.file_tab_hard = document.getElementById('file_tab_hard');
    dn.el.file_tab_soft = document.getElementById('file_tab_soft');
    dn.el.file_tab_soft_text = document.getElementById('file_tab_soft_text');
    dn.el.file_tab_info = document.getElementById('file_tab_info');
    dn.el.button_save = document.getElementById('button_save');
    dn.el.button_print = document.getElementById('button_print');
    dn.el.button_share = document.getElementById('button_share');
    dn.el.button_history = document.getElementById('button_history');     
    dn.syntax_drop_down = dn.create_syntax_menu();   // TODO: tidy up
    dn.el.file_ace_mode_choose.appendChild(dn.syntax_drop_down.el);
    dn.create_file_details_tool();
    dn.el.menu_file.addEventListener('click', function(){
        dn.g_settings.set('pane', 'pane_file');
    })

     // pane general settings :::::::::::::::::::::::::::::::::::::::::::::::::::::
    dn.el.pane_general_settings = document.getElementById('pane_general_settings');
    dn.el.theme_chooser = document.getElementById('theme_chooser')
    dn.el.widget_sub_general_box = document.getElementById('sub_general_box')
    dn.el.button_clear_clipboard = document.getElementById("button_clear_clipboard");
    dn.el.button_clear_find_replace = document.getElementById("button_clear_find_replace");
    dn.el.gutter_history_show = document.getElementById('gutter_history_show');
    dn.el.gutter_history_hide = document.getElementById('gutter_history_hide');
    dn.el.word_wrap_off = document.getElementById('word_wrap_off');
    dn.el.word_wrap_at = document.getElementById('word_wrap_at');
    dn.el.word_wrap_edge = document.getElementById('word_wrap_edge');
    dn.el.font_size_decrement = document.getElementById('font_size_decrement');
    dn.el.font_size_increment = document.getElementById('font_size_increment');
    dn.el.font_size_text = document.getElementById('font_size_text');
    dn.el.tab_hard = document.getElementById('tab_hard');
    dn.el.tab_soft = document.getElementById('tab_soft');
    dn.el.newline_menu_windows = document.getElementById('newline_menu_windows');
    dn.el.newline_menu_unix = document.getElementById('newline_menu_unix');
    dn.el.tab_soft_text = document.getElementById('tab_soft_text');
    dn.el.tab_soft_dec = document.getElementById('tab_soft_dec');
    dn.el.tab_soft_inc = document.getElementById('tab_soft_inc');
    dn.el.word_wrap_at_text = document.getElementById('word_wrap_at_text');
    dn.el.word_wrap_at_dec = document.getElementById('word_wrap_at_dec');
    dn.el.word_wrap_at_inc = document.getElementById('word_wrap_at_inc');
    dn.theme_drop_down = dn.create_theme_menu()  // TODO: tidy this up
    dn.el.theme_chooser.appendChild(dn.theme_drop_down.el);
    dn.el.newline_menu_windows.addEventListener('click', function(){
        dn.g_settings.set('newLineDefault', 'windows');
    });
    dn.el.newline_menu_unix.addEventListener('click', function(){
        dn.g_settings.set('newLineDefault', 'unix');
    });
    dn.el.tab_hard.addEventListener('click', function(){
        dn.g_settings.set('tabIsHard', 1)
    });
    dn.el.tab_soft.addEventListener('click', function(){
        dn.g_settings.set('tabIsHard', 0);
    });
    dn.el.tab_soft_dec.addEventListener('click', function(){
        var at = dn.g_settings.get('softTabN') - 1;
        at = at < dn.min_soft_tab_n ? dn.min_soft_tab_n : at;
        dn.g_settings.set('softTabN',at);
    });
    dn.el.tab_soft_dec.addEventListener('click', function(){
        var at = dn.g_settings.get('softTabN') + 1;
        at = at > dn.max_soft_tab_n ? dn.max_soft_tab_n : at;
        dn.g_settings.set('softTabN',at);
    });
    dn.el.font_size_decrement.addEventListener('click', dn.font_size_decrement_click);
    dn.el.font_size_increment.addEventListener('click', dn.font_size_increment_click);    
    dn.el.word_wrap_off.addEventListener('click', function(){
        dn.g_settings.set('wordWrap',[0,0,0])
    });
    dn.el.word_wrap_at.addEventListener('click', function(){
        var at = dn.g_settings.get('wordWrapAt');
        dn.g_settings.set('wordWrap',[1,at,at]);
    });
    dn.el.word_wrap_at_dec.addEventListener('click', function(){
        var at = dn.g_settings.get('wordWrapAt') - dn.wrap_at_increment;
        at = at < dn.min_wrap_at ? dn.min_wrap_at : at;
        dn.g_settings.set('wordWrapAt',at);
    });
    dn.el.word_wrap_at_inc.addEventListener('click', function(){
        var at = dn.g_settings.get('wordWrapAt') + dn.wrap_at_increment;
        at = at > dn.max_wrap_at ? dn.max_wrap_at : at;
        dn.g_settings.set('wordWrapAt',at);
    });
    dn.el.word_wrap_edge.addEventListener('click', function(){
        dn.g_settings.set('wordWrap',[1,null,null])
    });
    dn.el.gutter_history_show.addEventListener('click', function(){
        dn.g_settings.set('showGutterHistory',1);
    });
    dn.el.gutter_history_hide.addEventListener('click', function(){
        dn.g_settings.set('showGutterHistory',0);
    });
    dn.create_clipboard_tool();
    dn.el.menu_general_settings.addEventListener('click', function(){
        dn.g_settings.set('pane', 'pane_general_settings');
    })

    // pane permissions :::::::::::::::::::::::::::::::::::::::::::::::::::::::
    dn.el.pane_permissions = document.getElementById('pane_permissions');
    document.getElementById('button_auth').addEventListener('click', dn.launch_popup);

    // pane help ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
    dn.el.pane_help = document.getElementById('pane_help');
    dn.el.user_name = document.getElementById('user_name');
    dn.el.menu_help.addEventListener('click', function(){
        dn.g_settings.set('pane', 'pane_help');
    })

    // pane find ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::    
    dn.el.pane_find = document.getElementById('pane_find');
    dn.el.find_button_case_sensitive = document.getElementById('button_find_case_sensitive');
    dn.el.find_button_whole_words = document.getElementById('button_find_whole_words');
    dn.el.find_button_regex = document.getElementById('button_find_regex');
    dn.el.find_input = document.getElementById('find_input');
    dn.el.find_info = document.getElementById('find_info');
    dn.el.find_results = document.getElementById('find_results');
    dn.el.find_button_case_sensitive.addEventListener('click', function(){
        dn.g_settings.set('find_case_sensitive', !dn.g_settings.get('find_case_sensitive'));
    })
    dn.el.find_button_whole_words.addEventListener('click', function(){
        dn.g_settings.set('find_whole_words', !dn.g_settings.get('find_whole_words'));
    })
    dn.el.find_button_regex.addEventListener('click', function(){
        dn.g_settings.set('find_regex', !dn.g_settings.get('find_regex'));
    })
    dn.el.menu_find.addEventListener('click', dn.show_find);
    dn.el.find_input.addEventListener('keyup', dn.find_input_keyup);
    

    // pane open ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
    dn.el.pane_open = document.getElementById('pane_open');
    dn.el.opener_button_a = document.getElementById('opener_button_a');
    dn.el.opener_button_b = document.getElementById('opener_button_b');
    dn.el.menu_open.addEventListener('click', function(){
        dn.g_settings.set('pane', 'pane_open')
    });
    dn.el.opener_button_a.addEventListener('click', dn.do_open);
    dn.el.opener_button_b.addEventListener('click', dn.do_open);

    // pane first time info ::::::::::::::::::::::::::::::::::::::::::::::::::::    
    dn.el.pane_first_time_info = document.getElementById('pane_first_time_info');
    document.getElementById('first_time_dissmiss').addEventListener('click', function(){
        dn.g_settings.set('pane','');
    });

    // :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
    dn.make_keyboard_shortcuts();
    dn.load_default_settings();
    dn.load_default_properties();    
    document.addEventListener('contextmenu', prevent_default);
    document.addEventListener('dragover', dn.document_drag_over);
    document.addEventListener('drop', dn.document_drop_file);
    window.addEventListener('resize', dn.widget_apply_anchor);
    window.onbeforeunload = dn.query_unload;

    //work out what caused the page to load
    var params = window_location_to_params_object(); 
    if(params['state']){
        var state = {};
        try{
            state = JSON.parse(params['state']);    
        }catch(e){
            dn.show_error("Bad URL params:\n" + params['state']);
        }
        if(state.action && state.action == "open" && state.ids && state.ids.length > 0){
            dn.the_file.file_id = state.ids[0];
        }else if(state.action && state.action == "create"){
            dn.the_file.title = "untitled." + (state.ext ? state.ext : dn.g_settings.get('ext'));
            if(state.folderId)
                dn.the_file.folder_id = state.folderId;
            dn.create_file(); //will use the specified title and folderId
        }
    }else{
        dn.the_file.title = "untitled." + dn.g_settings.get('ext');
        dn.create_file();
    }

    dn.pr_auth.then(dn.authentication_done); // authentication Promise-like defined inline at top of html head
    dn.show_status(); 
}


if (document.readyState != 'loading')
    dn.document_ready();
else
    document.addEventListener('DOMContentLoaded', dn.document_ready);


