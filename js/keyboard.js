"use strict";

dn.platform = (function(){
    if(navigator.platform.indexOf("Win") >-1)
        return "Windows";
    else if(navigator.platform.indexOf("Linux") >-1)
        return "Linux";
    else if(navigator.platform.indexOf("Mac")>-1)
        return "Mac";
        
    return null;
})();

dn.create_pane_shortcuts = function(){
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

    dn.el.pane_help_shortcuts.innerHTML =  [
        "<div class='widget_box_title shortcuts_title'>Keyboard Shortcuts ",
             platform ? "(" + platform + ")" : "" ,
        "</div>",
        "<div class='shortcuts_header_action'>action</div><div class='shortcuts_header_key'>key</div>",
        "<div class='shortcuts_list'>",
        html.join(''),
        "</div>"].join('');

};

dn.esc_pressed = function(e){
    var will_show_find = !dn.g_settings.get('pane_open') && dn.g_settings.get('pane') == 'pane_find';
    if(will_show_find)
        dn.find_set_find_active_true();
    dn.g_settings.set('pane_open', !dn.g_settings.get('pane_open')); // doing this after the find_active=true, tells the change handler not to put focus back to editor
    if(will_show_find)
        dn.el.find_input.focus(); // we have to do this explcitly because we ran find_active=true when the input was (possibly) hidden
    e.preventDefault();
}

dn.find_shortcut_used = function(e){
    var sel = dn.editor.session.getTextRange(dn.editor.getSelectionRange());
    if(sel)
        dn.el.find_input.value = sel;
    dn.find_set_find_active_true();
    dn.g_settings.set('pane', 'pane_find'); // doing this after the find_active=true, tells the change handler not to put focus back to editor
    if(sel)
        dn.el.find_input.select();
    else
        dn.el.find_input.focus(); // we have to do this explcitly because we ran find_active=true when the input was (possibly) hidden
    e.preventDefault();
}

dn.make_keyboard_shortcuts = function(){
    //perviously was using ace for handling these shorcuts because it neater (and efficient?) but it was
    //annoying trying to ensure the editor always had focus, and not clear what to do when the editor wasn't showing.
    
    //we have to delete the default ace commands linked to the keys we care about
    dn.editor.commands.removeCommands([
        "find","findprevious","findnext","replace","jumptomatching","sortlines","selecttomatching","gotoline"]);

    //then add new commands on to the document using keymaster.js...
    key('command+s, ctrl+s,  ctrl+alt+s,  command+alt+s', dn.save_content);
    key('command+p, ctrl+p,  ctrl+alt+p,  command+alt+p', dn.do_print);
    key('command+o, ctrl+o,  ctrl+alt+o,  command+alt+o', dn.do_open);
    key('command+n, ctrl+n,  ctrl+alt+n,  command+alt+n', dn.do_new);
    key('command+l, ctrl+l,  ctrl+alt+l,  command+alt+l', dn.show_go_to);
    key('command+f, ctrl+f,  ctrl+alt+f,  command+alt+f', dn.find_shortcut_used); 
    key('command+r, ctrl+r,  ctrl+alt+r,  command+alt+r' + 
       ', command+g, ctrl+g,  ctrl+alt+g,  command+alt+g', dn.show_replace);
    key('command+h, ctrl+h,  ctrl+alt+h,  command+alt+h', dn.start_revisions_worker);
    key('esc', dn.esc_pressed);
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

    // Change "ctrl" to "cmd" if on Mac
    dn.ctrl_key = "crtl"
    if(dn.platform == 'Mac'){
        dn.ctrl_key = 'cmd';
        var els = dn.getElementsByClassName('ctrl_key');
        for(var ii=0; ii<els.length; ii++)
            els[ii].textContent = 'cmd'
    }
}
