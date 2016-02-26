"use strict";
// DRIVE NOTEPAD 2016
// by DM

var dn = dn || {};
dn.version_str = '2016a';

// ############################
// Constants and defaults, see alsp info.js
// ############################
dn.drag_delay_ms = 400;
dn.drag_shift_px = 40;

dn.default_settings = {
ext: 'txt',
wordWrap: [true,null,null],
wordWrapAt: 80,
fontSize: 1,
widget_anchor: ['l',50,'t',10],
showGutterHistory: 1,
lastDNVersionUsed: '',
newLineDefault: 'windows',
historyRemovedIsExpanded: true,
softTabN: 4,
tabIsHard: 0,
widgetSub: 'general'
}
dn.default_custom_props = {
    newline: "detect",
    tabs: "detect",
    aceMode: "detect"
};
dn.impersonal_settings_keys = ["wordWrap","wordWrapAt","fontSize","widget_anchor","showGutterHistory","historyRemovedIsExpanded","tabIsHard","softTabN","widgetSub"];
dn.theme = "ace/theme/chrome"; 
dn.can_show_drag_drop_error = true;
dn.min_font_size = 0.3;
dn.max_font_size = 5; 
dn.max_wrap_at = 200;
dn.min_wrap_at = 20;
dn.wrap_at_increment = 10;
dn.max_soft_tab_n = 10;
dn.min_soft_tab_n = 2;
dn.detect_tabs_spaces_frac = 0.9;
dn.detect_tabs_tabs_frac = 0.9;
dn.detect_tabs_n_spaces_frac = 0.99;
dn.detect_tabs_n_spaces_frac_for_default = 0.6;
dn.font_size_increment = 0.15;
dn.icon_mouse_over_ms = 300;
dn.editor_refocus_time_ms = 500;
dn.error_delay_ms = 5000;//5 seconds
dn.find_history_add_delay = 2000; //ms
dn.clipboard_info_delay = 500; //ms
dn.clipboard_max_length = 20; //TODO: decide whether a large clipboard slows page loads and whether we can do anything about it.
dn.is_showing_history = false;
dn.apis = {drive_is_loaded: false};

dn.status = {
    // 0: get action in progress
    // -1: failed
    //  1: success
    file_body: 0, 
    file_meta: 0, 
    authentication: 0,
    popup_active: 0, // 0 or 1, i.e. true or false
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
    if(dn.the_file.file_id)
        dn.load_file();
    dn.get_properties_from_cloud();

    // TODO: make these redundant
    // Access token has been successfully retrieved, requests can be sent to the API
    gapi.load('drive-realtime', function(){dn.api_loaded('drive-realtime')});
    gapi.load('picker', function(){dn.api_loaded('picker');});
    gapi.load('drive-share', function(){dn.api_loaded('sharer');});
}

dn.authentication_failed = function(err){
    dn.status.authorization = -1;
    dn.status.popup_active = 0;
    dn.show_status();
    if(err)
        dn.show_error(err.result.error.message);
    else
        dn.show_content_permissions(); // No access token could be retrieved, force the authorization flow.
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

dn.show_content_permissions = function(){
    //dn.el_widget_text.textContent = "Manual authorization required.";

    dn.show_widget_content(dn.el_content_permissions);
    css_animation(dn.el_the_widget, 'shake', function(){}, dn.error_delay_ms);
}

dn.create_content_permissions = function(){
    dn.el_content_permissions = document.createElement('div');
    dn.el_content_permissions.innerHTML = [
        "<br><div class='button_wrapper'><div class='button popupbutton'>Autherize...</div></div><br><br>",
        "Click the button above to launch a popup window and login to your Google account and/or grant permisions to this app.<br><br>",
        "This step will not normally be required when you use the app.<br><br>If you do not see a popup window when you click the button you may ",
        "need to disable your popup blocker and reload the page."].join('');
    dn.el_content_permissions.id = 'content_permissions'
    dn.el_widget_content.appendChild(dn.el_content_permissions);
    dn.el_content_permissions.style.display = 'none';
    dn.el_content_permissions.getElementsByClassName('popupbutton')[0].addEventListener('click', dn.launch_popup);

}


// ############################
// Sharing stuff
// ############################

dn.do_share = function(){
    if(!dn.the_file.file_id){
        dn.show_error("You cannot view/modify the sharing settings until you have saved the file.")
        return false;
    }

    alert("In a moment you will see the Google Sharing dialog.  Please note that whatever information you see there will be correct - and you can make changes to it in the dialog. \nHowever, until you refresh the page, Drive Notepad will " + 
        (dn.the_file.is_shared ? "continue to show the file as being 'shared' even if that is no longer true." :
        "not show any indication that the file is now shared (if that is what you choose).") +
        "\nHopefully this will be fixed at some point soon!")
        
    dn.el_share_dialog.setItemIds([dn.the_file.file_id]);
    dn.el_share_dialog.showSettingsDialog();
    
    //TODO: see SO question about no callback for share dialog...how are we supposed to know when it's closed and what happened?
    return false;
}


// ############################
// Newline stuff
// ############################
dn.create_newlinemenu_tool = function(){
    dn.el_newline_menu_windows.addEventListener('click', function(){
        dn.g_settings.set('newLineDefault','windows');
    });
    dn.el_newline_menu_unix.addEventListener('click', function(){
        dn.g_settings.set('newLineDefault','unix');
    });
}

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
        dn.el_newline_menu_windows.classList.add('selected')
        dn.el_newline_menu_unix.classList.remove('selected');
    }else{//newlineDefault should be unix
        dn.el_newline_menu_unix.classList.add('selected')
        dn.el_newline_menu_windows.classList.remove('selected');
    }             
                
   if(typeof str == "string")
       dn.detect_new_line(str); //Note that it only makes sense to detect new line on downloaded content
   
   dn.show_newline_status(dn.the_file.new_line_detected); //if default changes after load or we have a new file we need this.
   
    dn.el_file_newline_detect.classList.remove('selected');
    dn.el_file_newline_windows.classList.remove('selected');
    dn.el_file_newline_unix.classList.remove('selected');
   if(dn.the_file.custom_props.newline == "detect"){
        if(dn.the_file.new_line_detected == "windows" || dn.the_file.new_line_detected == "unix")
            dn.editor.session.setNewLineMode(dn.the_file.new_line_detected);
        else
            dn.editor.session.setNewLineMode(newlineDefault);    
        dn.el_file_newline_detect.classList.add('selected');
    }else{
        dn.editor.session.setNewLineMode(dn.the_file.custom_props.newline);
            if(dn.the_file.custom_props.newline == "windows")
                dn.el_file_newline_windows.classList.add('selected');
            else
                dn.el_file_newline_unix.classList.add('selected');            
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
    
    dn.el_file_newline_info.textContent = "(" + str +")";
    
    return statusStr;
}

// ############################
// First time usage stuff
// ############################

dn.show_first_time_user_info = function(last_version){
    // last version could be blank
    // TODO: update this
    dn.el_content_first_time_info = document.createElement('div');
    dn.el_content_first_time_info.innerHTML = [
        "<div class='widget_box_title widget_firsttime_title'>First-time usage tips</div>",
        "You can move this thing by dragging the top part.<br><br>",
        "To access the menu click the status text above or use the shortcut key, Esc<br><br>",
        "Changes are not saved as you type, you have to press save in the menu or use the shortcut key, ",
            (dn.platform == "Mac" ? "Cmd" : "Ctrl" ) + "-S." ,
        "<br><br><div class='button_wrapper'><div class='button firsttime_dissmiss'>Dismiss</div></div>" ].join('');
    dn.el_content_first_time_info.id = 'content_first_time_info';
    dn.el_widget_content.appendChild(dn.el_content_first_time_info);
    dn.el_content_first_time_info.getElementsByClassName('firsttime_dissmiss')[0]
                .addEventListener('click', function(){dn.show_widget_content()});
    dn.show_widget_content(dn.el_content_first_time_info);
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

dn.create_open_tool = function(){
    dn.el_content_open = document.createElement('div');
    dn.el_content_open.id = 'content_open';
    dn.el_content_open.innerHTML = [
        "<div class='widget_menu_item'>Open an existing file in:<br><br><div class='button_wrapper'><div class='button'",
        "id='opener_button_a'>this tab</div> <div class='button' id='opener_button_b'",
        ">a new tab</div></div><br></div><br>",
        "<div class='widget_menu_item'>Create a new file in:<br><br><div class='button_wrapper'><div class='button'",
        "id='opener_button_c'>this tab</div> <div class='button' id='opener_button_d'",
        ">a new tab</div></div><br></div>"].join('');
    dn.el_content_open.style.display = 'none';
    dn.el_widget_content.appendChild(dn.el_content_open);

    dn.el_menu_open.addEventListener('click', function(){dn.show_widget_content(dn.el_content_open)});

    dn.el_opener_chooser = dn.el_widget_content.parentNode.getElementsByClassName('widget_open_tab_choice')[0];
    
    dn.el_opener_button_a = document.getElementById('opener_button_a');
    dn.el_opener_button_a.addEventListener('click', function(){
        //TODO:
    });
    dn.el_opener_button_b = document.getElementById('opener_button_b');
    dn.el_opener_button_b.addEventListener('click', function(){
        //TODO:
    });
}

dn.picker_callback = function(data) {
  if (data.action == google.picker.Action.PICKED) {
    var fileId = data.docs[0].id;
    dn.reclaim_focus();
    var url = window.location.href.match(/^https?:\/\/[\w-.]*\/\w*/)[0] +
              "?state={\"action\":\"open\",\"ids\":[\"" + fileId +"\"]}";
    dn.el_opener_button_a.setAttribute('href', url);
    dn.el_opener_button_b.setAttribute('href', url);
    dn.toggle_widget(false);
    dn.el_opener_chooser.style.display = '';
    css_animation(dn.el_the_widget, 'shake', function(){}, dn.error_delay_ms);
  }else if(data.action == "cancel"){
      dn.reclaim_focus();
  } 
}

dn.create_content_help = function(){
    dn.el_content_help = document.createElement('div');
    dn.el_content_help.innerHTML = [
        "<div class='widget_box_title'>Drive Notepad 2016a, by DM.</div>",
        "<a href='' target='_blank'>google+</a> - for bug reports, questions, etc.*<br>",
        "<a href='' target='_blank'>youtube</a> - quick demo.<br>",
        "<a href='' target='_blank'>about</a> - more information.<br><br>",
        "<div class='widget_box_title'>Logged in as <span id='user_name'>???</span></div>",
        "<a href='https://drive.google.com' target='_blank' id='drive_link'>Google Drive</a> - open your Drive<br>",
        "<br><br>*positive feedback is always appriciated!"].join('');

    dn.el_content_help.id = 'content_help';
    dn.el_content_help.style.display = 'none';
    dn.el_widget_content.appendChild(dn.el_content_help);
    dn.el_user_name = document.getElementById('user_name');
    dn.el_menu_help.addEventListener('click', function(){
        dn.show_widget_content(dn.el_content_help);
    })

}



// ############################
// Find replace stuff
// ############################

//A "quick", no sorry, a "longish" note:
//Each time DoFind runs it stores its str in dn.finding_str for next time.
//dn.find_history_pointer is nan except when we are cycling through history. As soon 
//as we change the search string we leave this history-cyclying mode.  Also, immediately before
//entering the history-cycling mode we store the current str at the top of the history so it's
//available to come back to.
//A search is added to the history if it's not the empty string and has not been modified for 
//dn.find_history_add_delay milliseconds.
//Dealing with focus is a bit of a pain.  Basically either of the two input boxes may have it
//or a third party (such as the editor itself) may have it. We only want to show the markings
//when one of the two input boxes has the focus and not otherwise.  Also, while the inputs have the focus
//they disable the editor's steal-back-the-focus timer, which normally ensures it doesn't loose the focus.
//So we need to make sure that timer is reneabled when the focus is with neither of the two inputs.
//To make this work, whenver one of the inputs loses focus (the "blur" event) it triggers a delayed
//call to BlurFindAndFocusEditor, the fact that it is delayed allows the other input to cancel
//the call if it is the thing recieving the focus, otherwise it will go ahead.
//There are other complications too, but this is the bulk of it.
dn.do_find = function(str){
    //this function is to be used internally by the find/replace functions
    
    while(dn.find_result_markers.length)
        dn.editor.session.removeMarker(dn.find_result_markers.pop());
                
    if(str == ""){
        dn.el_find_replace_info.innerHTML = "Type to search.<br>Ctrl-Up/Down: cycle though history";
    }else{
        var search = dn.editor.$search;
        search.set({needle: str});
        dn.editor.find(str,{skipCurrent: false});
        var r = search.findAll(dn.editor.session);
        if(r && r.length > 0){
            for(var i=0;i<r.length;i++)
                dn.find_result_markers.push(dn.editor.session.addMarker(r[i], "find_result", "find_result",false)); 
            
                dn.el_find_replace_info.innerHTML = "Found " + r.length + " occurances<br>" +
                 "Enter: find next<br>Shift+Enter: find previous<br>Esc: hide the find/replace box" +
                 (dn.showing_replace ?  "<br>Tab: focus on replace field" : "") + "<br>Ctrl-Up/Down: cycle though history";
        }else{
            dn.el_find_replace_info.innerHTML = "No occurences found.<br>Ctrl-Up/Down: cycle though history";
        }
    }
    dn.finding_str = str;
    if(dn.g_find_history && isNaN(dn.find_history_pointer)){
        if(dn.find_history_add_timeout)
            clearTimeout(dn.find_history_add_timeout);
        if(str.length)
            dn.find_history_add_timeout = setTimeout(function(){dn.add_tofind_history(str);},dn.find_history_add_delay)
    }
}

dn.add_tofind_history = function(str){
    clearTimeout(dn.find_history_add_timeout); // in case this was called directly
    dn.find_history_add_timeout = 0;
    if(!str.length || !isNaN(dn.find_history_pointer))
        return;
        
        //TODO: there is an inconsistency here: the find is case-insensitive, but lastIndexOf is case sensitiv
    if(dn.g_find_history.lastIndexOf(str) != -1)
        dn.g_find_history.remove(dn.g_find_history.lastIndexOf(str)); //if the string was already in the list somewhere we remove the old item so that values are unique
    //note that strictly speaking I think these operations should be done within a pair batching flags, but it doesn't really matter here.
    dn.g_find_history.push(str); 
}

dn.cancel_blur_find_and_focus_editor = function(){
    clearTimeout(dn.blur_find_and_focus_editor_timer);
    dn.blur_find_and_focus_editor_timer = 0;
}
dn.blur_find_and_focus_editor = function(flag){
    clearTimeout(dn.blur_find_and_focus_editor_timer);
    dn.blur_find_and_focus_editor_timer = 0;
    if(flag==="delay"){
        dn.blur_find_and_focus_editor_timer = setTimeout(dn.blur_find_and_focus_editor,10); //this gives the other input element time to cancel the closing if there is a blur-focus event when focus shifts
        return; //note that we are assuming here that the blur event is triggered on the first element *before* the focus is triggered on the second element..if that isn't guaranteed to be true we'd need to check whether the second element already has the focus when the first element gets its blur event.
    }
    dn.showing_find_results = false;
    dn.reclaim_focus();
    while(dn.find_result_markers.length)
        dn.editor.session.removeMarker(dn.find_result_markers.pop());               
}
    

dn.create_content_find = function(){
    dn.el_content_find = document.createElement('div');

    dn.el_content_find.innerHTML = [
        "<div class='widget_menu_item'><input class='find_input' tabindex='1' placeholder='find text'></input>",
        "<div class='replace_form'><input tabindex='2' class='replace_input' placeholder='replace with'></input>",
        "<div class='find_replace_info'></div></div></div><br><br>",
        "<div class='widget_menu_item'>Go to: <input class='gotoline_input' id='goto_input' placeholder='line number'></input></div>"].join('');
    dn.el_content_find.id = 'content_find';
    dn.el_content_find.style.display = 'none';
    dn.el_widget_content.appendChild(dn.el_content_find);

    dn.el_menu_find.addEventListener('click', dn.show_find);

    dn.el_replace_form = dn.el_content_find.getElementsByClassName("replace_form")[0];
    dn.el_find_replace_info = dn.el_content_find.getElementsByClassName('find_replace_info')[0];
    dn.el_find_input = dn.el_content_find.getElementsByClassName("find_input")[0];
    dn.el_replace_input = dn.el_content_find.getElementsByClassName("replace_input")[0];
    
    dn.el_find_input.addEventListener('focus', function(){
            dn.cancel_blur_find_and_focus_editor();
            dn.showing_find_results = true;
            if(dn.showing_replace)
                dn.el_replace_input.setAttribute("tabindex", parseInt(dn.el_find_input.getAttribute("tabindex"))+1); //we want to force the replace input to always be the next tab index
            dn.do_find(dn.finding_str);
        });
    dn.el_find_input.addEventListener('blur', function(){
            if(dn.showing_replace)
                dn.blur_find_and_focus_editor("delay");
            else
              dn.blur_find_and_focus_editor();
        });
    dn.el_find_input.addEventListener('keydown',function(e){ //we want keydown here so that we can get repeated firing whith keydown (i think on most browsers)
        if(e.which == WHICH.ENTER)
            if(e.shiftKey)
                dn.editor.findPrevious();
            else
                dn.editor.findNext();
                                     
        if(e.which == WHICH.ESC){
            dn.blur_find_and_focus_editor(); 
            //the normal togglewidget shortcut will kick in
        }
        if(e.ctrlKey && (e.which == WHICH.UP || e.which == WHICH.DOWN)){
            if(isNaN(dn.find_history_pointer)){
                dn.add_tofind_history(dn.finding_str);  //when we begin delving into history
                dn.find_history_pointer = dn.g_find_history.length-1;
            }
            dn.find_history_pointer += e.which == WHICH.DOWN? -1 : +1;
            dn.find_history_pointer = dn.find_history_pointer < 0 ? 0 : dn.find_history_pointer;
            dn.find_history_pointer = dn.find_history_pointer > dn.g_find_history.length-1 ? dn.g_find_history.length-1 : dn.find_history_pointer; 
            var newStr = dn.g_find_history.get(dn.find_history_pointer);
            dn.el_find_input.value = newStr;
            dn.do_find(newStr);
            e.preventDefault();
        }
    });

    dn.el_find_input.addEventListener("keyup", function(e){ //we need keyup here in order that the val has the new character or new backspace
        if(e.which == WHICH.ENTER || e.which == WHICH.ESC || e.which == WHICH.UP || e.which == WHICH.DOWN)
            return; 
        if(dn.finding_str == dn.el_find_input.value)
            return;
        if(dn.el_find_input.value != dn.finding_str)
            dn.find_history_pointer = NaN;
        dn.do_find(dn.el_find_input.value)
    })
    dn.el_replace_input.addEventListener('focus', function(){
        dn.cancel_blur_find_and_focus_editor();
        if(!dn.showing_find_results)
            dn.do_find(dn.finding_str);
            
        //we want to force the find input to always be the next tab index
        dn.el_find_input.setAttribute("tabindex",parseInt(dn.el_replace_input.setAttribute("tabindex"))+1); 
        if(dn.find_result_markers.length)
            dn.el_find_replace_info.innerHTML = "Found " + dn.find_result_markers.length + " occurances<br>" +
             "Enter: replace current selection<br>Ctrl+Enter: replace all<br>Esc: hide the find/replace box<br>Tab: focus on find field";
        else
            dn.el_find_replace_info.innerHTML = "Nothing to replace.<br>Esc: hide the find/replace box<br>Tab: focus on find field";
    });
    dn.el_replace_input.addEventListener("keydown",function(e){ //we want keydown here so that we can get repeated firing whith keydown (i think on most browsers)
        if(e.which == WHICH.ENTER){
            if(!dn.find_result_markers.length)
                return;
            var n = e.ctrlKey ? dn.find_result_markers.length : 1;
            if(e.ctrlKey)
                dn.editor.replaceAll(dn.el_replace_input.value);
            else
                dn.editor.replace(dn.el_replace_input.value);
            if(e.shiftKey)
                dn.editor.findPrevious()
            else
                dn.editor.findNext();
            dn.do_find(dn.finding_str); 
            if(dn.find_result_markers.length){
                dn.el_find_replace_info.innerHTML = "Replaced " + n + " occurence" + (n>1? "s" : "") + ". <br>" +  dn.find_result_markers.length + " occurances remain<br>" +
                 "Enter: replace current selection<br>Ctrl+Enter: replace all<br>Esc: hide the find/replace box<br>Tab: focus on find field";
            } else {
                dn.el_find_replace_info.innerHTML = "Replaced " + (n>1 ? "all " + n + " occurences" : "the 1 occurance") +
                ". <br> Nothing further to replace.<br>Esc: hide the find/replace box<br>Tab: focus on find field";
            }
        }
        if(e.which == WHICH.ESC){
            dn.blur_find_and_focus_editor(); 
            //the normal togglewidget shortcut will kick in
        }
    })
    dn.el_replace_input.addEventListener('blur', function(){
          dn.blur_find_and_focus_editor("delay");
    });


    // GOTO stuff
    dn.el_goto_input = document.getElementById('goto_input');
    dn.el_goto_input.addEventListener('blur', dn.reclaim_focus); // TODO: make this work properly
    dn.el_goto_input.addEventListener('keyup', function(e){
        if(e.which == WHICH.ENTER || e.which == WHICH.ESC){
                if(e.which == WHICH.ENTER) //if it's esc the normal ToggleWidget shortcut will kick in.
                    dn.el_widget_goto.style.display = 'none';
            dn.reclaim_focus();
            return;
        }
        var val = this.value;
        if(val){
            var line = parseInt(val,10);
            if(!isNaN(line))
                dn.editor.gotoLine(line,0,true);
        }
    });


                  
}

dn.show_find = function(){
    dn.show_widget_content(dn.el_content_find);
    dn.showing_replace = false;
    dn.el_replace_form.style.display = 'none';
    var sel = dn.editor.session.getTextRange(dn.editor.getSelectionRange());
    if(sel)
        dn.el_find_input.value = sel;
    dn.el_find_input.focus();
    if(!sel)
        dn.el_find_input.select();
    dn.find_history_pointer = NaN;
    return false;
}

dn.show_replace = function(){
    dn.showing_replace = true;
    dn.el_replace_form.style.display = '';
    var sel = dn.editor.session.getTextRange(dn.editor.getSelectionRange());
    dn.el_content_find.style.display = '';
    if(sel)
        dn.el_find_input.value = sel;
    dn.el_find_input.focus()
    if(!sel)
        dn.el_find_input.select();
    return false;
}



// ############################
// Widget stuff
// ############################

dn.show_widget_content = function(el){
    // el can be undefined/null to hide everything

    for(var ii=0; ii < dn.el_widget_content.children.length; ii++)if(dn.el_widget_content.children[ii] !== el){
        dn.el_widget_content.children[ii].style.display = 'none';
        var el_icon = dn.menu_icon_from_content_id[dn.el_widget_content.children[ii].id];
        if(el_icon)
            el_icon.classList.remove('icon_selected');
    }

    if(el){
        el.style.display = '';
        var el_icon = dn.menu_icon_from_content_id[el.id];
        if(el_icon)
            el_icon.classList.add('icon_selected');
        dn.toggle_widget(true);
    }else{
        dn.toggle_widget(false);
    }
}

dn.create_content_general_settings = function(){
    dn.el_content_general_settings = document.createElement('div');
    dn.el_content_general_settings.innerHTML = [            
        "<div class='widget_menu_item'>Recent changes: ",
            "<div class='button inline_button ' id='gutter_history_hide'>hide</div>",
            "<div class='button inline_button ' id='gutter_history_show'>show</div>",
        "</div>",
    
        "<div class='widget_menu_item'>Word wrap: ",
            "<div class='button inline_button ' id='word_wrap_off'>none</div>",
            "<div class='button inline_button ' id='word_wrap_at'>",
                "<div class='button_sub' id='word_wrap_at_text'>??</div>",
                "<div class='button_sub button_sub_unselectable' id='word_wrap_at_dec'>&#9660;</div>",
                "<div class='button_sub button_sub_unselectable' id='word_wrap_at_inc'>&#9650;</div>",
            "</div>", 
            "<div class='button inline_button ' id='word_wrap_edge'>edge</div>",
        "</div>",
                
        "<div class='widget_menu_item'>Font size: ",
            "<div class='button inline_button  font_size_decrement'>&#9660;abc</div>", //TODO: make this a single button
            "<div class='button inline_button  font_size_increment'>abc&#9650;</div>",
        "</div>",
                
        "<div class='widget_menu_item'>Tab default: ",
            "<div class='button inline_button ' id='tab_hard'>hard</div>",
            "<div class='button inline_button ' id='tab_soft'>",
                    "<div class='button_sub' id='tab_soft_text'>?? spaces</div>", 
                    "<div class='button_sub button_sub_unselectable' id='tab_soft_dec'>&#9660;</div>",
                    "<div class='button_sub button_sub_unselectable' id='tab_soft_inc'>&#9650;</div>",
            "</div>",
        "</div>",
                
        "<div class='widget_menu_item'>Newline default: ",
            "<div class='button inline_button ' id='newline_menu_windows'>windows</div>",
            "<div class='button inline_button ' id='newline_menu_unix'>unix</div>",
        "</div>",
        
        "<div class='widget_menu_item'>Clear history:<br><br><div class='button_wrapper'>",
            "<div class='button' id='clipboard_history_clear_button'>clipboard</div> ",
            "<div class='button' id='find_history_clear_button'>find/replace</div>",
        "</div></div>"].join('');
    dn.el_content_general_settings.id = 'content_general_settings';
    dn.el_content_general_settings.style.display = 'none';
    dn.el_widget_content.appendChild(dn.el_content_general_settings);

    dn.el_widget_sub_general_box = document.getElementById('sub_general_box')
    dn.el_menu_clear_clipboard = document.getElementById("clipboard_history_clear_button");
    dn.el_menu_clear_find_history = document.getElementById("find_history_clear_button");

    dn.el_gutter_history_show = document.getElementById('gutter_history_show');
    dn.el_gutter_history_hide = document.getElementById('gutter_history_hide');
    dn.el_word_wrap_off = document.getElementById('word_wrap_off');
    dn.el_word_wrap_at = document.getElementById('word_wrap_at');
    dn.el_word_wrap_edge = document.getElementById('word_wrap_edge');
    // TODO: fix inconsitency of Ids versus classes
    dn.el_font_size_decrement = dn.el_content_general_settings.getElementsByClassName('font_size_decrement')[0];
    dn.el_font_size_increment = dn.el_content_general_settings.getElementsByClassName('font_size_increment')[0];
    dn.el_tab_hard = document.getElementById('tab_hard');
    dn.el_tab_soft = document.getElementById('tab_soft');
    dn.el_newline_menu_windows = document.getElementById('newline_menu_windows');
    dn.el_newline_menu_unix = document.getElementById('newline_menu_unix');

    dn.create_newlinemenu_tool(); // TODO: could be inlined here
    dn.create_tab_tool();
    dn.create_fontsize_tool();
    dn.create_wordwrap_tool();
    dn.create_gutterhistory_tool();
    dn.create_clipboard_tool();

    dn.el_menu_general_settings.addEventListener('click', function(){
        dn.show_widget_content(dn.el_content_general_settings);
    })
}

dn.create_content_file = function(){
    dn.el_content_file = document.createElement('div');
    dn.el_content_file.innerHTML = [
        "<div class='widget_menu_item details_file_title' clickable=1>" ,
            "<div class='details_file_title_text' data-info='title'></div>" ,
            "<input type='text' placeholder='title' class='details_file_title_input' style='display:none;'/>" ,
        "</div>" ,

        "<div class='widget_menu_item details_file_description' clickable=1>",
            "<div class='details_file_description_text' data-info='description'></div>",
            "<textarea placeholder='description' class='details_file_description_input' style='display:none;'></textarea>",
        "</div>",
       
        "<div class='widget_spacer'></div>",
       
       "<div class='widget_menu_item details_file_ace_mode'>Syntax: ",
            "<div class='button inline_button ' id='file_ace_mode_detect'>detect</div>",
            "<div class='button inline_button dropdown_button' id='file_ace_mode_choose'></div>",
            "<div class='file_info' id='file_ace_mode_info'></div>",  
        "</div>",
        "<div class='widget_spacer'></div>",
        "<div class='widget_menu_item details_file_newline'>Newline: ",
            "<div class='button inline_button ' id='file_newline_detect'>detect</div>",
            "<div class='button inline_button ' id='file_newline_windows'>windows</div>",
            "<div class='button inline_button ' id='file_newline_unix'>unix</div>",
            "<div class='file_info' id='file_newline_info'></div>",
        "</div>",
        "<div class='widget_spacer'></div>",
        "<div class='widget_menu_item details_file_tab'>Tabs: ",
            "<div class='button inline_button ' id='file_tab_detect'>detect</div>",
            "<div class='button inline_button ' id='file_tab_hard'>hard</div>",
            "<div class='button inline_button ' id='file_tab_soft'>",
                "<div class='button_sub' id='file_tab_soft_text'>?? spaces</div>", 
                "<div class='button_sub button_sub_unselectable' id='file_tab_soft_dec'>▼</div>",
                "<div class='button_sub button_sub_unselectable' id='file_tab_soft_inc'>▲</div>",
            "</div>", 
            "<div class='file_info' id='file_tab_info'></div>",
        "</div>"].join("");
    dn.el_content_file.id = 'content_file';
    dn.el_content_file.style.display = 'none';
    dn.el_widget_content.appendChild(dn.el_content_file);

    dn.el_details_title_input  = dn.el_content_file.getElementsByClassName('details_file_title_input')[0];
    dn.el_details_title_text = dn.el_content_file.getElementsByClassName('details_file_title_text')[0];
    dn.el_details_description_input  = dn.el_content_file.getElementsByClassName('details_file_description_input')[0];
    dn.el_details_description_text = dn.el_content_file.getElementsByClassName('details_file_description_text')[0];
    dn.syntax_drop_down = dn.create_syntax_menu()
    
    // TODO: fix inconsitency of Ids versus classes
    dn.el_file_ace_mode_choose = document.getElementById('file_ace_mode_choose')
    dn.el_file_ace_mode_choose.appendChild(dn.syntax_drop_down.el);
    dn.el_file_ace_mode_detect = document.getElementById('file_ace_mode_detect');
    dn.el_file_ace_mode_info = document.getElementById('file_ace_mode_info');
    dn.el_file_newline_detect = document.getElementById('file_newline_detect');
    dn.el_file_newline_windows = document.getElementById('file_newline_windows');
    dn.el_file_newline_unix = document.getElementById('file_newline_unix');
    dn.el_file_newline_info = document.getElementById('file_newline_info');
    dn.el_file_tab_detect = document.getElementById('file_tab_detect');
    dn.el_file_tab_hard = document.getElementById('file_tab_hard');
    dn.el_file_tab_soft = document.getElementById('file_tab_soft');
    dn.el_file_tab_soft_text = document.getElementById('file_tab_soft_text');
    dn.el_file_tab_info = document.getElementById('file_tab_info');

    dn.create_file_details_tool();  // this could really be appended directly to this function.

    dn.el_menu_file.addEventListener('click', function(){
        dn.show_widget_content(dn.el_content_file);
    })
}

dn.create_menu = function(){
    dn.el_widget_toolbar = document.getElementById('widget_toolbar');
    dn.el_widget_toolbar.innerHTML =  [
            "<div class='widget_menu_wrapper' id='menu_print' style='display:none;'></div>",
            "<div class='widget_menu_wrapper' id='menu_sharing' style='display:none;'></div>",
            "<div class='widget_menu_wrapper' id='menu_save' style='display:none;'></div>" ,
            "<div class='widget_menu_wrapper' id='menu_history' style='display:none;'></div>" ,
            "<div class='widget_menu_wrapper' id='menu_file'></div>" ,
            "<div class='widget_menu_wrapper' id='menu_find'></div>",  
            "<div class='widget_menu_wrapper' id='menu_new'  style='display:none;'></div>",
            "<div class='widget_menu_wrapper' id='menu_open'></div>",    
            "<div class='widget_menu_wrapper' id='menu_general_settings'></div>" ,
            "<div class='widget_menu_wrapper' id='menu_shortcuts' style='display:none;'></div>",
            "<div class='widget_menu_wrapper' id='menu_help'></div>"].join('');


    dn.menu_icon_from_content_id = {}
    var els = dn.el_widget_toolbar.getElementsByClassName('widget_menu_wrapper');
    for(var ii=0; ii<els.length; ii++){
        els[ii].addEventListener("click",function(){dn.reclaim_focus();});
        els[ii].innerHTML = "<div class='tooltip widget_menu_tooltip'>" + dn.menu_id_to_caption[els[ii].id] + "</div>" +
                            "<div class='widget_menu_icon' id='icon_" + els[ii].id + "'></div>";
        var el_icon = els[ii].getElementsByClassName('widget_menu_icon')[0];
        dn.menu_icon_from_content_id['content_' + els[ii].id.substr(5)] = el_icon;
    }
    
    dn.el_menu_save = document.getElementById('menu_save');
    dn.el_menu_print = document.getElementById('menu_print');
    dn.el_menu_sharing = document.getElementById('menu_sharing');
    dn.el_menu_history = document.getElementById('menu_history');     
    dn.el_menu_shortcuts = document.getElementById('menu_shortcuts');
    dn.el_menu_status = document.getElementById('menu_status');

    dn.el_menu_open = document.getElementById('menu_open');
    dn.el_menu_find = document.getElementById('menu_find');
    dn.el_menu_help = document.getElementById('menu_help');
    dn.el_menu_file = document.getElementById('menu_file');
    dn.el_menu_general_settings = document.getElementById('menu_general_settings');
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
        translate(dn.el_the_widget, x, y);
    e.stopPropagation();

};

dn.document_mouse_up_widget = function(e){
    document.removeEventListener('mousemove', dn.document_mouse_move_widget);
    document.removeEventListener('mouseup', dn.document_mouse_up_widget);

    if(dn.widget_mouse_down_info.is_dragging){
        var pos = dn.el_the_widget.getBoundingClientRect();
        translate(dn.el_the_widget, 0, 0);
    
        //work out what widget_anchor should be
        var widget_w = dn.el_the_widget.offsetWidth;
        var widget_h = dn.el_the_widget.offsetHeight;
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
        dn.toggle_widget(); // TODO: toggle open/closed properly
    }
    dn.widget_mouse_down_info = undefined;
};

dn.widget_apply_anchor = function(anchor){
    anchor = $.isArray(anchor) ? anchor : dn.g_settings.get('widget_anchor');
    var widget_w = dn.el_the_widget.offsetWidth;
    var widget_h = dn.el_the_widget.offsetHeight;
    var window_w = window.innerWidth;
    var window_h = window.innerHeight;

    // TODO: should test whether toolbar tooltips are too close to the edge, in which case you can flip them.

    if(anchor[0] == 'l'){
        // horizontal position is anchored to a fixed percentage of window width on left of widget
        if(window_w * anchor[1]/100 + widget_w > window_w){
            dn.el_the_widget.style.left = 'inherit';
            dn.el_the_widget.style.right = '0px'; //if the widget would overlap the right edge, then instead put it precisely on the right edge
        }else{
            dn.el_the_widget.style.left = anchor[1] + '%';
            dn.el_the_widget.style.right = ''; //use the anchor exactly
        }

        // set toolbar position
        dn.el_widget_toolbar.classList.add('flipped');
        dn.el_widget_content.classList.add('flipped');
        var els = document.getElementsByClassName('widget_menu_icon');
        for(var ii=0; ii<els.length; ii++)
            els[ii].classList.add('flipped');
        els = document.getElementsByClassName('tooltip widget_menu_tooltip');
        for(var ii=0; ii<els.length; ii++)
            els[ii].classList.add('flipped');

    }else{
        // horizontal position is anchored to a fixed percentage of window width on right of widget
        if( window_w * anchor[1]/100 + widget_w > window_w){
            dn.el_the_widget.style.left = '0px';
            dn.el_the_widget.style.right = ''; //if the widget would overlap the left edge, then instead put it precisely on the left edge
        }else{
            dn.el_the_widget.style.left = 'inherit';
            dn.el_the_widget.style.right = anchor[1] + '%'; //use the anchor exactly
        }

        // set toolbar position
        dn.el_widget_toolbar.classList.remove('flipped');
        dn.el_widget_content.classList.remove('flipped');
        var els = document.getElementsByClassName('widget_menu_icon');
        for(var ii=0; ii<els.length; ii++)
            els[ii].classList.remove('flipped');
        els = document.getElementsByClassName('tooltip widget_menu_tooltip');
        for(var ii=0; ii<els.length; ii++)
            els[ii].classList.remove('flipped');
    }

    if(anchor[2] == 't'){
        // vertical position is anchored to a fixed percentage of window height on top of widget
        if(window_h * anchor[3]/100 + widget_h > window_h){
            dn.el_the_widget.style.top = 'inherit';
            dn.el_the_widget.style.bottom = '0px';  
        }else{
            dn.el_the_widget.style.top = anchor[3] + '%';
            dn.el_the_widget.style.bottom = ''; 
        }
    }else{
        // vertical position is anchored to a fixed percentage of window height on bottom of widget
        if(window_h * anchor[3]/100 + widget_h > window_h){
            dn.el_the_widget.style.top = '0px';
            dn.el_the_widget.style.bottom = ''; 
        }else{
            dn.el_the_widget.style.top = 'inherit';
            dn.el_the_widget.style.bottom = anchor[3] + '%'; 
        }
    }



}

dn.toggle_widget = function(state){
    // provide argument "true" to open widget, "false" to close, and no arg to toggle.

    if(dn.ignore_escape){
        dn.ignore_escape = false;
        return;
    }
    if(dn.is_showing_history)
        dn.close_history();

    if(state === undefined)
        state = dn.el_widget_toolbar.style.display === 'none';

    if(state){
        dn.el_widget_toolbar.style.display = '';
        dn.el_widget_content.style.display = '';
    }else{
        dn.el_widget_toolbar.style.display = 'none';
        dn.el_widget_content.style.display = 'none';
    }
    dn.reclaim_focus();
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
            if(!dn.the_file.is_pristine)
                s += "\n(unsaved changes)";
        }else if(dn.status.file_meta === 0 && dn.status.file_body === 0)
            s = "Loading file:\n" + dn.the_file.file_id;
        else if(dn.status.file_meta === 1 && dn.status.file_body === 0)
            s = "Loading file:\n" + dn.the_file.title;
        else if(dn.status.file_meta === 0 && dn.status.file_body === 1)
            s = "Loading metadata for file:\n" + dn.the_file.file_id;
        else if(dn.status.file_meta === 1) // and -1
            s = "Failed to download file:\n" + dn.the_file.title;
        else if(dn.status.file_body === 1) // and -1
            s = "Failed to download metadata for file:\n" + dn.the_file.file_id;
        else // both -1
            s = "Failed to load file:\n" + dn.the_file.file_id;
    } else {
        // no file to load
        s = "ex nihilo omnia...";
    }

    text_multi(dn.el_widget_text, s, true);
}

dn.show_error = function(message){
    console.log(message); //it's just useful to do this too
    text_multi(dn.el_widget_error_text, message,true);
    dn.el_widget_error.style.display = '';
    css_animation(dn.el_the_widget, 'shake', function(){
        dn.el_widget_error.style.display = 'none';
    }, dn.error_delay_ms);
};

dn.set_drive_link_to_folder = function(){
    var el = document.getElementById('drive_link');
    if(el && dn.the_file.folder_id)
        el.setAttribute('href','https://drive.google.com/#folders/' + dn.the_file.folder_id);
    else
        el.setAttribute('href','https://drive.google.com');
}


// ############################
// Settings stuff
// ############################

dn.get_settings_from_cloud = function() {
  gapi.drive.realtime.loadAppDataDocument(
  function(doc) {
    var oldTempG_settings = dn.g_settings;
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
    for(var s in dn.default_settings)
        if(s in oldTempG_settings.getKeeps())
            dn.g_settings.set(s,oldTempG_settings.get(s));
        else if(existingKeys.indexOf(s) == -1)
            dn.g_settings.set(s,dn.default_settings[s]);
        else if(JSON.stringify(oldTempG_settings.get(s)) !== JSON.stringify(dn.g_settings.get(s)))
            dn.settings_changed({property:s, new_value:dn.g_settings.get(s)});// the gapi doesn't automatically trigger this on load
    
    //Check lastDNVersionUsed at this point - by default it's blank, but could also have an out-of-date value
    if(dn.g_settings.get('lastDNVersionUsed') != dn.version_str){
        dn.show_first_time_user_info(dn.g_settings.get('lastDNVersionUsed'));
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
                                 dn.settings_changed({property: k, new_value: v});
                                 },
              keep: function(k){keeps[k] = true},
              getKeeps: function(){return keeps;}};
                                 
  })();
  try{
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
}

dn.settings_changed = function(e){
    console.log("[user settings] " + e.property +": " + e.new_value);
    if(dn.impersonal_settings_keys.indexOf(e.property)>-1 && localStorage){
        localStorage["g_settings_" + e.property] = JSON.stringify(e.new_value);
    }
    try{
        switch(e.property){
            case "widget_anchor":
                dn.widget_apply_anchor(e.new_value);
                    break;
            case "fontSize":
                var scrollLine = dn.get_scroll_line();
                dn.editor.setFontSize(e.new_value + 'em')    
                dn.editor.scrollToLine(scrollLine);
                break;
            case "wordWrap":
                var s = dn.editor.getSession();
                var scrollLine = dn.get_scroll_line();
                s.setUseWrapMode(e.new_value[0]);
                s.setWrapLimitRange(e.new_value[1],e.new_value[2]);
                 dn.editor.scrollToLine(scrollLine);
                if(!e.new_value[0])
                    dn.el_word_wrap_off.classList.add('selected');
                else
                    dn.el_word_wrap_off.classList.remove('selected');
                if(e.new_value[0] && !e.new_value[1])
                    dn.el_word_wrap_edge.classList.add('selected');
                else
                    dn.el_word_wrap_edge.classList.remove('selected');
                if(e.new_value[0] && e.new_value[1])
                    dn.el_word_wrap_at.classList.add('selected');
                else
                    dn.el_word_wrap_at.classList.remove('selected');

                break;
            case "wordWrapAt":
                dn.el_word_wrap_at_text.textContent = e.new_value;
                var curWrap = dn.g_settings.get('wordWrap');
                if(curWrap[1] && curWrap[1] != e.new_value)
                    dn.g_settings.set('wordWrap',[1,e.new_value,e.new_value]);
                dn.editor.setPrintMarginColumn(e.new_value);
                break;
            case "showGutterHistory":
                var s = dn.editor.getSession(); 
                if(e.new_value){
                    dn.el_gutter_history_show.classList.add('selected')
                    dn.el_gutter_history_hide.classList.remove('selected');
                }else{
                    var h = dn.change_line_history;
                    for(var i=0;i<h.length;i++)if(h[i])
                        s.removeGutterDecoration(i,h[i]<0 ? dn.change_line_classes_rm[-h[i]] : dn.change_line_classes[h[i]]);
                    dn.change_line_history = []; 
                    dn.el_gutter_history_hide.classList.add('selected')
                    dn.el_gutter_history_show.classList.remove('selected');
                }
                break;
            case "newLineDefault":
                dn.apply_newline_choice();
                break;
            case "historyRemovedIsExpanded":
                dn.revision_setis_expaned(e.new_value);
                break;
            case "softTabN":
            case "tabIsHard":          
                dn.apply_tab_choice(); 
                break;
            case "widgetSub":
                break;
            case 'widgetCurrent':
                break; // TODO: recall widget tab
        }
    }catch(err){
        console.log("Error while uptating new settings value.")
        console.dir(e);
        console.dir(err);
    }
}


// ############################
// Keyboard shortcuts stuff
// ############################

dn.platform = (function(){
    if(navigator.platform.indexOf("Win") >-1)
        return "Windows";
    else if(navigator.platform.indexOf("Linux") >-1)
        return "Linux";
    else if(navigator.platform.indexOf("Mac")>-1)
        return "Mac";
        
    return null;
})();

dn.create_content_shortcuts = function(){
//This is hardly the world's most efficient way of doing this....(but it probably doesn't matter)...

    var arry = dn.shortcuts_list;
    var dict = {};
    var platform = dn.platform;

    if(platform == "Windows" || platform == "Linux"){
       for(var i=0;i<arry.length;i++){
            var parts = arry[i].split("|");
            if(parts[1].length)
                dict[parts[0]] = parts[1];
        }
    }else if(platform == "Mac"){
        for(var i=0;i<arry.length;i++){
            var parts = arry[i].split("|");
            if(parts[1].length)
                dict[parts[0]] = parts.length > 2? parts[2] : parts[1];
        }
    }else{
        //TODO: show something here, maybe let user switch, maybe have touch info for ipad & android.
    }
    
    var html = [];
    for(var action in dict)
        html.push("<div class='shortcut_item'><div class='shortcut_action'>" + 
                   action + "</div><div class='shortcut_key'>" + dict[action].replace(",","<br>") +
                   "</div></div>");
    for(var action in dn.tooltip_info)if(action in dict)
        dn.tooltip_info[action] += dict[action];

    dn.el_content_shortcuts = document.createElement('div');
    dn.el_content_shortcuts.innerHTML = [
            "<div class='widget_box_title shortcuts_title'>Keyboard Shortcuts ",
                 platform ? "(" + platform + ")" : "" ,
            "</div>",
            "<div class='shortcuts_header_action'>action</div><div class='shortcuts_header_key'>key</div>",
            "<div class='shortcuts_list'>",
            html.join(''),
            "</div>"].join('');
    dn.el_content_shortcuts.style.display = 'none';
    dn.el_content_shortcuts.id = 'content_shortcuts';
    dn.el_widget_content.appendChild(dn.el_content_shortcuts);
};

dn.make_keyboard_shortcuts = function(){
    //perviously was using ace for handling these shorcuts because it neater (and efficient?) but it was
    //annoying trying to ensure the editor always had focus, and not clear what to do when the editor wasn't showing.
    
    //we have to delete the default ace commands linked to the keys we care about
    dn.editor.commands.removeCommands(["find","findprevious","findnext","replace", "jumptomatching","sortlines","selecttomatching","gotoline"]);

    //then add new commands on to the $(document) using keymaster.js...
    key('command+s, ctrl+s,  ctrl+alt+s,  command+alt+s', dn.save_content);
    key('command+p, ctrl+p,  ctrl+alt+p,  command+alt+p', dn.do_print);
    key('command+o, ctrl+o,  ctrl+alt+o,  command+alt+o', dn.do_open);
    key('command+n, ctrl+n,  ctrl+alt+n,  command+alt+n', dn.do_new);
    key('command+l, ctrl+l,  ctrl+alt+l,  command+alt+l', dn.show_go_to);
    key('command+f, ctrl+f,  ctrl+alt+f,  command+alt+f', dn.show_find);
    key('command+r, ctrl+r,  ctrl+alt+r,  command+alt+r' + 
       ', command+g, ctrl+g,  ctrl+alt+g,  command+alt+g', dn.show_replace);
    key('command+h, ctrl+h,  ctrl+alt+h,  command+alt+h', dn.start_revisions_worker);
    key('esc', dn.toggle_widget);    
    key.filter = function(){return 1;}


    // it seems like the clipboard history cycling only works the old way, i.e. using ace....
    var HashHandler = require("ace/keyboard/hash_handler").HashHandler
    var extraKeyEvents = new HashHandler([
        {bindKey: {win: "Ctrl-Left",mac: "Command-Left"}, descr: "Clipboard cyle back on paste", exec: dn.document_clipboard_left},
        {bindKey: {win: "Ctrl-Down",mac: "Command-Down"}, descr: "Clipboard cyle back on paste", exec: dn.document_clipboard_left},
        {bindKey: {win: "Ctrl-Right",mac:"Command-Right"}, descr: "Clipboard cyle forward on paste", exec: dn.document_clipboard_right},
        {bindKey: {win: "Ctrl-Up",mac:"Command-Up"}, descr: "Clipboard cyle forward on paste", exec: dn.document_clipboard_right}
    ]);
    dn.editor.keyBinding.addKeyboardHandler(extraKeyEvents);
}


dn.reclaim_focus = function(){
    dn.editor.focus(); //this was much more complciated previously when the non-ace shortcuts went through the editor rather than through the document
}

// ############################
// Font size stuff
// ############################

dn.create_fontsize_tool = function(){
    dn.el_font_size_decrement.addEventListener('click', function(){
        var fontSize = dn.g_settings.get('fontSize');
        fontSize -= dn.font_size_increment;
        fontSize = fontSize  < dn.min_font_size ? dn.min_font_size:fontSize;
        dn.g_settings.set('fontSize',fontSize);
    })
    dn.el_font_size_increment.addEventListener('click', function(){
        var fontSize = dn.g_settings.get('fontSize');
        fontSize += dn.font_size_increment;
        fontSize = fontSize  > dn.max_font_size ? dn.max_font_size:fontSize;
        dn.g_settings.set('fontSize',fontSize);
    })
}


// ############################
// Word wrap stuff
// ############################

dn.create_wordwrap_tool = function(){
    dn.el_word_wrap_off.addEventListener('click', function(){
        dn.g_settings.set('wordWrap',[0,0,0])
    });
    dn.el_word_wrap_at.addEventListener('click', function(){
        var at = dn.g_settings.get('wordWrapAt');
        dn.g_settings.set('wordWrap',[1,at,at]);
    });
    dn.el_word_wrap_at_text = document.getElementById('word_wrap_at_text');
    document.getElementById('word_wrap_at_dec').addEventListener('click', function(){
        var at = dn.g_settings.get('wordWrapAt') - dn.wrap_at_increment;
        at = at < dn.min_wrap_at ? dn.min_wrap_at : at;
        dn.g_settings.set('wordWrapAt',at);
    });
    document.getElementById('word_wrap_at_inc').addEventListener('click', function(){
        var at = dn.g_settings.get('wordWrapAt') + dn.wrap_at_increment;
        at = at > dn.max_wrap_at ? dn.max_wrap_at : at;
        dn.g_settings.set('wordWrapAt',at);
    });
    dn.el_word_wrap_edge.addEventListener('click', function(){
        dn.g_settings.set('wordWrap',[1,null,null])
    });
}

// ############################
// Tab stuff
// ############################
// Note that there is a whitespace extension for ace but it doesn't look that mature and we actually have slightly different requirements here.

dn.create_tab_tool = function(){
    dn.el_tab_soft_text = document.getElementById('tab_soft_text');

    dn.el_tab_hard.addEventListener('click', function(){
        dn.g_settings.set('tabIsHard',1)
    });
    dn.el_tab_soft.addEventListener('click', function(){
        dn.g_settings.set('tabIsHard',0);
    });
    document.getElementById('tab_soft_dec').addEventListener('click', function(){
        var at = dn.g_settings.get('softTabN') - 1;
        at = at < dn.min_soft_tab_n ? dn.min_soft_tab_n : at;
        dn.g_settings.set('softTabN',at);
    });
    document.getElementById('tab_soft_inc').addEventListener('click', function(){
        var at = dn.g_settings.get('softTabN') + 1;
        at = at > dn.max_soft_tab_n ? dn.max_soft_tab_n : at;
        dn.g_settings.set('softTabN',at);
    });
}

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
                    str = "detected soft-tabs roughly matching default " + d.n + " spaces";
                    break;
                case 'failed':
                    str = "detected soft-tabs, assuming default " + d.n + " spaces";
                    break;
            }
    }
    
    dn.el_file_tab_info.textContent = "(" + str +")";
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
    
    dn.el_tab_soft_text.textContent = defaultSoftTabN + " spaces";
    if(defaultTabIsHard){
        dn.el_tab_hard.classList.add('selected');
        dn.el_tab_soft.classList.remove('selected');
    }else{
        dn.el_tab_soft.classList.add('selected');
        dn.el_tab_hard.classList.remove('selected');
    }
    
    
    dn.el_file_tab_detect.classList.remove('selected');
    dn.el_file_tab_hard.classList.remove('selected');
    dn.el_file_tab_soft.classList.remove('selected');
    if(isDetected){
        dn.el_file_tab_detect.classList.add('selected');
        dn.el_file_tab_soft_text.textContent = nSpaces+ " spaces";
    }else{
        if(d.val == "tab")
            dn.el_file_tab_hard.classList.add('selected');
        else
            dn.el_file_tab_soft.classList.add('selected');
        dn.el_file_tab_soft_text.textContent = nSpaces + " spaces";
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
    dn.el_file_ace_mode_info.textContent = "(" + str + ")";
    return d.syntax;
}
dn.detect_syntax = function(){
    dn.the_file.syntax_detected = (function(){ //no need to use self-ex-func here, just laziness...
        //TODO: improve upon this
        var title = dn.the_file.title || "untitled.txt";
        var mode  = require("ace/ext/modelist").getModeForPath(title)
        dn.the_file.syntax_detected = mode.caption;
        dn.show_syntax_status({syntax: dn.the_file.syntax_detected});
        return mode;
    })();
}

dn.apply_syntax_choice = function(){
    dn.detect_syntax();
    if(dn.the_file.custom_props["aceMode"] == "detect"){
        dn.set_syntax(dn.the_file.syntax_detected);
        dn.el_file_ace_mode_detect.classList.add('selected');
        dn.syntax_drop_down.SetSelected(false);
    }else{
        dn.set_syntax(dn.the_file.custom_props["aceMode"])
        dn.el_file_ace_mode_detect.classList.remove('selected');
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
        dn.reclaim_focus();
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
        dn.reclaim_focus();
    }
}
dn.create_file_details_tool = function(){
    var els = [dn.el_details_title_text,
               dn.el_details_description_text,
               dn.el_file_newline_detect,
               dn.el_file_newline_windows,
               dn.el_file_newline_unix,
               dn.el_file_tab_detect,
               dn.el_file_tab_soft,
               dn.el_file_tab_hard,
               dn.el_file_ace_mode_detect];
    for(var ii=0; ii< els.length; ii++)
        els[ii].addEventListener("click",dn.read_only_bail); //If file is read only, ReadOnlyBail will prevent the click handlers below from running.
        
    //Title change stuff
    dn.el_details_title_text.addEventListener('click', function(){                
            dn.el_details_title_text.style.display = 'none';
            dn.el_details_title_input.style.display = '';
            dn.el_details_title_input.focus();
            dn.el_details_title_input.select();
    });
    dn.el_details_title_input.addEventListener("blur", function(){
            dn.el_details_title_input.style.display = 'none';
            dn.el_details_title_text.style.display = '';
            var new_val = dn.el_details_title_input.value;
            if(new_val == dn.the_file.title)
                return;
            dn.the_file.title = new_val
            dn.show_file_title(); //includes showStatus
            dn.apply_syntax_choice();
            dn.save_file_title();
            dn.reclaim_focus();
    });
    dn.el_details_title_input.addEventListener('keyup', function(e){
            if(e.which == WHICH.ENTER)
                dn.el_details_title_input.trigger('blur');
    });
    dn.el_details_title_input.addEventListener('keydown', function(e){
        if(e.which == WHICH.ESC){
            dn.el_details_title_input.value = dn.the_file.title;
            dn.el_details_title_input.trigger('blur');
            dn.ignore_escape = true; //stops ToggleWidget
        }
    });

    // File action buttons stuff
    dn.el_menu_save.addEventListener('click', dn.save_content);
    dn.el_menu_print.addEventListener('click', dn.do_print);
    dn.el_menu_sharing.addEventListener('click', dn.do_share);
    dn.el_menu_history.addEventListener('click', dn.start_revisions_worker);

    // Description stuff
    dn.el_details_description_text.addEventListener('click', function(){            
            dn.el_details_description_text.style.display = 'none';
            dn.el_details_description_input.style.display = '';
            dn.el_details_description_input.focus();
    });
    dn.el_details_description_input.addEventListener("blur", function(){
            dn.el_details_description_input.style.display = 'none';
            dn.el_details_description_text.style.display = '';
            var new_val = dn.el_details_description_input.value;
            if(dn.the_file.description === new_val)
                return;
            dn.the_file.description = new_val;
            dn.show_description();
            dn.save_file_description();
            dn.reclaim_focus();
    });
    dn.el_details_description_input.addEventListener('keydown',function(e){
            if(e.which == WHICH.ESC){
                dn.el_details_description_input.value = dn.the_file.description;
                dn.el_details_description_input.trigger('blur');
                dn.ignore_escape = true;
            }
    });
        
    // File custom props stuff
    dn.el_file_newline_detect.addEventListener('click', function(){
         dn.set_property("newline","detect");
         dn.reclaim_focus();      
    });
    dn.el_file_newline_windows.addEventListener('click', function(){
         dn.set_property("newline","windows");
         dn.reclaim_focus();
        });
    dn.el_file_newline_unix.addEventListener('click', function(){
         dn.set_property("newline","unix");
         dn.reclaim_focus();
        });
    dn.el_file_tab_detect.classList.add('selected');
    dn.el_file_tab_detect.addEventListener('click', function(){
        dn.set_property("tabs","detect");
        dn.reclaim_focus();
    });
    dn.el_file_tab_soft.addEventListener('click', function(){
        dn.set_file_tabs_to_soft_or_hard("spaces",0);
        dn.reclaim_focus();
    });
    document.getElementById('file_tab_soft_dec').addEventListener('click', function(){
        dn.set_file_tabs_to_soft_or_hard("spaces",-1);
        dn.reclaim_focus();
    });
    document.getElementById('file_tab_soft_inc').addEventListener('click', function(){
        dn.set_file_tabs_to_soft_or_hard("spaces",+1);
        dn.reclaim_focus();
    })
    dn.el_file_tab_hard.addEventListener('click', function(){
        dn.set_file_tabs_to_soft_or_hard("tab",0);
        dn.reclaim_focus();
    });
    dn.el_file_ace_mode_detect.addEventListener('click', function(){
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
    dn.el_details_title_text.textContent = 'Title: ' + dn.the_file.title;
    dn.el_details_title_input.value = dn.the_file.title;
    document.title = (dn.the_file.is_pristine ? "" : "*") + dn.the_file.title;
    dn.show_status();
}

dn.show_description = function(){
    text_multi(dn.el_details_description_text, 'Description: ' + dn.the_file.description,true);
    dn.el_details_description_input.value = dn.the_file.description;
}

// ############################
// Revisions stuff
// ############################
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
        dn.el_widget_content.innerHTML('afterend', 
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
        dn.el_widget_file_history = dn.el_widget_content.parentNode.getElementsByClassName('widget_revisions')[0];
        dn.el_widget_file_history.style.display = 'none';
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
            worker: new Worker("revisionsworker.js")
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
    dn.el_widget_file_history.style.display = '';
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
        dn.el_ace_content.setAttribute('saving',true);
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
                dn.el_ace_content.removeAttribute('saving');
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
            dn.el_ace_content.removeAttribute('saving');
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
            + ace.require(dn.theme).cssText + "\nbody{font-size:"
            + dn.g_settings.get('fontSize') *14 +"px; white-space:pre-wrap;" + 
            "font-family:'Monaco','Menlo','Ubuntu Mono','Droid Sans Mono','Consolas',monospace;}"
            + "\nli{color:gray;}\n.printline{color:black;}</style>" + 
            "<body class='"+ dn.theme.replace("/theme/","-") +"'><ol id='content'>" + 
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
        dn.el_content_clipboard.style.display = 'none';
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
        dn.el_content_clipboard.style.display = '';
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
    dn.el_content_clipboard = document.createElement('div');
    dn.el_content_clipboard.innerHTML = [
        "When you paste with 'ctrl-v' (or 'cmd-v') you can cycle through your Drive Notepad clipboard ",
        "by pressing 'left' or 'right' before releaing the 'ctrl' (or 'cmd') key. <br><br> You can clear your clipboard history by clicking the ",
        "relevant button in the settings menu."].join('');
    dn.el_content_clipboard.style.display = 'none';
    dn.el_widget_content.appendChild(dn.el_content_clipboard);

    dn.el_menu_clear_clipboard.addEventListener('click', function(){
            dn.g_clipboard.clear();
    });
    dn.el_menu_clear_find_history.addEventListener('click', function(){
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
    dn.el_menu_new.addEventListener('click', dn.do_new);
}

dn.create_file = function(){
    dn.apply_syntax_choice();
    dn.the_file.is_brand_new = true;
    dn.show_file_title();
    dn.show_description();
    dn.apply_newline_choice();
    dn.apply_tab_choice();
    dn.toggle_widget(false);
    dn.g_settings.set("widgetSub","file");  
    if(dn.g_settings.keep)
        dn.g_settings.keep("widgetSub");
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
    dn.el_ace_content.setAttribute('saving', true);
    dn.show_status();
    dn.save_file(null, meta, f.data_to_save.body, $.proxy(dn.save_done,gens));
}

dn.saved_new_file = function(resp){
    dn.the_file.is_brand_new = false;
    dn.the_file.file_id = resp.id;
    dn.the_file.is_shared = resp.shared;
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
            'params':{'fields': 'name,mimeType,description,parents,capabilities,fileExtension'}}))
        .then(dn.load_file_got_meta_data, function(err){
            dn.show_error(err.result.error.message);
            dn.status.file_meta = -1;
            dn.show_status();
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
        });

    
    dn.pr_the_file = Promise.all([promise_get_meta, promise_get_body])
    .then(function(){ 
        //success
    }, function(){
        // failure
        document.title = "Drive Notepad";
    })
    
}

dn.load_file_got_meta_data = function(resp) {
    if (resp.error)
        throw Error(resp.error);
    dn.the_file.title = resp.result.name;
    dn.the_file.description = resp.result.description || '';
    dn.show_description();
    dn.the_file.ext = resp.result.fileExtension
    dn.the_file.is_read_only = !resp.result.canEdit;
    //dn.the_file.is_shared = resp.shared; // TODO: 
    dn.the_file.loaded_mime_type = resp.result.mimeType;
    if(resp.result.parentNodes && resp.result.parentNodes.length){
        dn.the_file.folder_id = resp.result.parentNodes[0].id;
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

dn.create_gutterhistory_tool = function(){
    dn.el_gutter_history_show.addEventListener('click', function(){
            dn.g_settings.set('showGutterHistory',1);
        });
    dn.el_gutter_history_hide.addEventListener('click', function(){
        dn.g_settings.set('showGutterHistory',0);
        });
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

// ############################
// Page ready stuff
// ############################


dn.document_ready = function(e){
    dn.el_the_widget = document.getElementById('the_widget');
    dn.el_the_widget.addEventListener('mousedown', dn.widget_mouse_down);

    translate(dn.el_the_widget, 0, 0);
    dn.el_the_widget.style.display = '';
    dn.el_widget_text = document.getElementById('widget_text');

    dn.el_widget_error_text = document.getElementById('widget_error_text');
    dn.el_widget_error = document.getElementById('widget_error');
    dn.el_widget_error.style.display = 'none';

    dn.el_widget_content = document.getElementById('widget_content');
    dn.el_widget_content.addEventListener('mousedown', function(e){e.stopPropagation();});

    var editor_el = document.getElementById('the_editor');
    editor_el.innerHTML = '';
    editor_el.addEventListener('contextmenu', function(e){
        dn.show_error("See the list of keyboard shortcuts for copy/paste, select-all, and undo/redo.")
    });
    dn.editor = ace.edit("the_editor");
    dn.el_ace_content = document.getElementsByClassName('ace_content')[0];
    dn.editor.on('focus', dn.blur_find_and_focus_editor)
    dn.editor.focus();
    dn.editor.setTheme(dn.theme);
    dn.editor.getSession().addEventListener("change", dn.on_change);
    dn.editor.on("paste", dn.on_paste);
    dn.editor.on("copy", dn.on_copy);
    dn.editor.setAnimatedScroll(true);
    
    
    dn.create_menu();
    dn.create_content_file();
    dn.create_content_general_settings();
    dn.create_content_shortcuts();
    dn.create_content_permissions();
    dn.create_content_help();

    dn.create_open_tool();
    
    dn.create_content_find();
    
    dn.make_keyboard_shortcuts();
    dn.load_default_settings();
    dn.load_default_properties();
    
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

    // authentication Promise defined inline at top of html head
    dn.pr_auth.then(dn.authentication_done);
    dn.show_status(); 
}

dn.get_user_info = function(){
   Promise.resolve(
        gapi.client.request({
            'path' : 'userinfo/v2/me?fields=name'
        })).then(function(a){
            dn.user_info = a.result;
            dn.el_user_name.textContent = a.result.name;
        }, function(err){
            // TODO: could be auth problem
            dn.show_error('Failed to get user info');
            console.dir(err);
        });
}

dn.api_loaded = function(APIName){
    // TODO: make this redundant
    if(APIName == 'drive-realtime'){
        dn.get_settings_from_cloud();
    }
    if(APIName == 'picker'){
        console.log("got picker API");
    }
    if(APIName == 'sharer'){
        dn.el_share_dialog = new gapi.drive.share.ShareClient(dn.client_id);
    }
}



if (document.readyState != 'loading')
    dn.document_ready();
else
    document.addEventListener('DOMContentLoaded', dn.document_ready); // IE 9+ compatible

document.addEventListener('contextmenu', function(e){e.preventDefault();});
document.addEventListener('dragover', dn.document_drag_over);
document.addEventListener('drop', dn.document_drop_file);


// See https://developers.google.com/apis-explorer 