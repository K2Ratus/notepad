"use strict";

/*
A "quick", no sorry, a "longish" note:
Each time DoFind runs it stores its str in dn.finding_str for next time.
dn.find_history_pointer is nan except when we are cycling through history. As soon 
as we change the search string we leave this history-cyclying mode.  Also, immediately before
entering the history-cycling mode we store the current str at the top of the history so it's
available to come back to.
A search is added to the history if it's not the empty string and has not been modified for 
dn.find_history_add_delay milliseconds.
Dealing with focus is a bit of a pain.  Basically either of the two input boxes may have it
or a third party (such as the editor itself) may have it. We only want to show the markings
when one of the two input boxes has the focus and not otherwise.  Also, while the inputs have the focus
they disable the editor's steal-back-the-focus timer, which normally ensures it doesn't loose the focus.
So we need to make sure that timer is reneabled when the focus is with neither of the two inputs.
To make this work, whenver one of the inputs loses focus (the "blur" event) it triggers a delayed
call to BlurFindAndFocusEditor, the fact that it is delayed allows the other input to cancel
the call if it is the thing recieving the focus, otherwise it will go ahead.
There are other complications too, but this is the bulk of it.
*/

dn.show_find = function(){
    dn.g_settings.set('pane', 'pane_find');
    var sel = dn.editor.session.getTextRange(dn.editor.getSelectionRange());
    if(sel)
        dn.el.find_input.value = sel;
    dn.el.find_input.focus();
    if(!sel)
        dn.el.find_input.select();
    return false;
}

dn.do_find = function(str){
    //this function is to be used internally by the find/replace functions
    dn.AceSearch = dn.AceSearch || ace.require("./search").Search;
    dn.AceRange = dn.AceRange || ace.require("./range").Range;
    str = str === undefined ? dn.el.find_input.value : str;

    //while(dn.find_result_markers.length)
    //    dn.editor.session.removeMarker(dn.find_result_markers.pop());
                
    dn.finding_str = str;
    if(str == ""){
        dn.el.find_info.textContent = "type to search. " + dn.ctrl_key + "-up/down for history.";
        dn.el.find_results.innerHTML = "";
    }else{
        var search = new dn.AceSearch();
        search.setOptions({
            needle: str,
            wrap: true,
            caseSensitive: dn.g_settings.get('find_case_sensitive'),
            wholeWord: dn.g_settings.get('find_whole_words'),
            regExp: dn.g_settings.get('find_regex')
        });

        var session = dn.editor.getSession();
        var results = search.findAll(session);
        if(results.length === 0){
            dn.el.find_info.textContent = "no matches found.";
            dn.el.find_results.innerHTML = "";
        }else{
            html = "";
            var selected_range = session.getSelection().getRange();
            for(var ii=0; ii<results.length; ii++) 
                if(results[ii].end.row > selected_range.start.row  || 
                    (results[ii].end.row == selected_range.start.row &&
                     results[ii].end.column >= selected_range.start.column))
                break;
            var current_match_idx = ii == results.length ? results.length-1 : ii;

            // collecting the right sub selection, with all the wrapping etc. seems to be a bit fiddly...
            var n = Math.floor(dn.find_max_results/2);
            var results_sub = [];
            var current_match_sub_idx;
            if(results.length <= dn.find_max_results){
                results_sub = results;
                current_match_sub_idx = current_match_idx;
            }else{
                if(current_match_idx < n){
                    results_sub = results_sub.concat(results.slice(current_match_idx - n));
                    results_sub = results_sub.concat(results.slice(0, current_match_idx));
                } else {
                    results_sub = results_sub.concat(results.slice(current_match_idx - n, current_match_idx));
                }
                current_match_sub_idx = results_sub.length;
                results_sub.push(results[current_match_idx]); 
                if(current_match_idx + n >= results.length){
                    results_sub = results_sub.concat(results.slice(current_match_idx + 1));
                    results_sub = results_sub.concat(results.slice(0, n + 1 - (results.length - current_match_idx)));
                } else {
                    results_sub = results_sub.concat(results.slice(current_match_idx + 1, current_match_idx + n + 1));
                }
            }

            for(var ii=0; ii<results_sub.length; ii++){
                var row = results_sub[ii].start.row;
                var col = results_sub[ii].start.column;
                var prefix_range = new dn.AceRange(row, Math.max(0, col-dn.find_max_prefix_chars), row, col);
                var pre_ellipses = col > dn.find_max_prefix_chars; //TODO: deal with indent better
                row = results_sub[ii].end.row;
                col = results_sub[ii].end.column;
                var suffix_range = new dn.AceRange(row, col, row, col+dn.find_max_suffix_chars);

                html += "<div class='find_result_item" + (ii==current_match_sub_idx? " find_result_current" : "") + "'>" +
                            "<div class='find_result_line_num'>" + (row+1) + "</div>" +
                            "<div class='find_result_text'>" +
                                "<div class='find_result_text_inner'>" +
                                    (pre_ellipses ? "&#8230;" : "") + escape_str(session.getTextRange(prefix_range)) +
                                    "<span class='find_result_match'>" + escape_str(session.getTextRange(results_sub[ii])) + "</span>" +
                                    escape_str(session.getTextRange(suffix_range)) +
                                "</div>" +
                            "</div>" +
                        "</div>";
            }
            dn.el.find_results.innerHTML = html;
            if(results.length > dn.find_max_results)
                dn.el.find_info.textContent = "... and " + (results.length - dn.find_max_results) + " more matches";
            else
                dn.el.find_info.textContent = "";
        }

        /*
        dn.editor.find(str,{skipCurrent: false});
        var r = search.findAll(dn.editor.session);
        if(r && r.length > 0){
            for(var i=0;i<r.length;i++)
                dn.find_result_markers.push(dn.editor.session.addMarker(r[i], "find_result", "find_result",false)); 
            
                dn.el.find_replace_info.innerHTML = "Found " + r.length + " occurances<br>" +
                 "Enter: find next<br>Shift+Enter: find previous<br>Esc: hide the find/replace box" +
                 (dn.showing_replace ?  "<br>Tab: focus on replace field" : "") + "<br>Ctrl-Up/Down: cycle though history";
        }else{
            dn.el.find_replace_info.innerHTML = "No occurences found.<br>Ctrl-Up/Down: cycle though history";
        }
        */
    }

    //dn.finding_str = str;
    //if(dn.g_find_history && isNaN(dn.find_history_pointer)){
    //    if(dn.find_history_add_timeout)
    //        clearTimeout(dn.find_history_add_timeout);
    //    if(str.length)
    //        dn.find_history_add_timeout = setTimeout(function(){dn.add_to_find_history(str);},dn.find_history_add_delay)
    //}
}

/*
dn.find_input_keydown = function(e){ 
    //we want keydown here so that we can get repeated firing whith keydown (i think on most browsers)
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
            dn.add_to_find_history(dn.finding_str);  //when we begin delving into history
            dn.find_history_pointer = dn.g_find_history.length-1;
        }
        dn.find_history_pointer += e.which == WHICH.DOWN? -1 : +1;
        dn.find_history_pointer = dn.find_history_pointer < 0 ? 0 : dn.find_history_pointer;
        dn.find_history_pointer = dn.find_history_pointer > dn.g_find_history.length-1 ? dn.g_find_history.length-1 : dn.find_history_pointer; 
        var newStr = dn.g_find_history.get(dn.find_history_pointer);
        dn.el.find_input.value = newStr;
        dn.do_find(newStr);
        e.preventDefault();
    }
}
*/

dn.find_input_keyup = function(e){ 
    //we need keyup here in order that the val has the new character or new backspace
    if(e.which == WHICH.ENTER || e.which == WHICH.ESC || e.which == WHICH.UP || e.which == WHICH.DOWN)
        return; 
    if(dn.finding_str == dn.el.find_input.value)
        return;
    //if(dn.el.find_input.value != dn.finding_str)
    //    dn.find_history_pointer = NaN;
    dn.do_find(dn.el.find_input.value)
}


/*
dn.add_to_find_history = function(str){
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
*/

dn.blur_find_and_focus_editor = function(flag){
    /*
    clearTimeout(dn.blur_find_and_focus_editor_timer);
    dn.blur_find_and_focus_editor_timer = 0;
    if(flag==="delay"){
        dn.blur_find_and_focus_editor_timer = setTimeout(dn.blur_find_and_focus_editor,10); //this gives the other input element time to cancel the closing if there is a blur-focus event when focus shifts
        return; //note that we are assuming here that the blur event is triggered on the first element *before* the focus is triggered on the second element..if that isn't guaranteed to be true we'd need to check whether the second element already has the focus when the first element gets its blur event.
    }
    dn.showing_find_results = false;
   dn.focus_editor();
    while(dn.find_result_markers.length)
        dn.editor.session.removeMarker(dn.find_result_markers.pop());               
    */
}
/*    
dn.find_input_focus = function(){
    dn.cancel_blur_find_and_focus_editor();
    dn.showing_find_results = true;
    if(dn.showing_replace)
        dn.el.replace_input.setAttribute("tabindex", parseInt(dn.el.find_input.getAttribute("tabindex"))+1); //we want to force the replace input to always be the next tab index
    dn.do_find(dn.finding_str);
}

dn.find_input_blur = function(){
    if(dn.showing_replace)
        dn.blur_find_and_focus_editor("delay");
    else
        dn.blur_find_and_focus_editor();
}
*/

/*

dn.find_goto_keyup = function(e){
    if(e.which == WHICH.ENTER || e.which == WHICH.ESC){
        if(e.which == WHICH.ENTER) //if it's esc the normal ToggleWidget shortcut will kick in.
            dn.el.widget_goto.style.display = 'none';
       dn.focus_editor();
        return;
    }
    if(this.value){
        var line = parseInt(this.value, 10);
        if(!isNaN(line))
            dn.editor.gotoLine(line,0,true);
    }
}


dn.find_replace_input_blur = function(){
    dn.blur_find_and_focus_editor("delay");
}

dn.find_replace_input_focus = function(){
    dn.cancel_blur_find_and_focus_editor();
    if(!dn.showing_find_results)
        dn.do_find(dn.finding_str);
    //we want to force the find input to always be the next tab index
    dn.el.find_input.setAttribute("tabindex",parseInt(dn.el.replace_input.setAttribute("tabindex"))+1); 
    if(dn.find_result_markers.length)
        dn.el.find_replace_info.innerHTML = "Found " + dn.find_result_markers.length + " occurances<br>" +
         "Enter: replace current selection<br>Ctrl+Enter: replace all<br>Esc: hide the find/replace box<br>Tab: focus on find field";
    else
        dn.el.find_replace_info.innerHTML = "Nothing to replace.<br>Esc: hide the find/replace box<br>Tab: focus on find field";
}

dn.find_replace_input_keydown = function(e){ 
    //we want keydown here so that we can get repeated firing whith keydown (i think on most browsers)
    if(e.which == WHICH.ENTER){
        if(!dn.find_result_markers.length)
            return;
        var n = e.ctrlKey ? dn.find_result_markers.length : 1;
        if(e.ctrlKey)
            dn.editor.replaceAll(dn.el.replace_input.value);
        else
            dn.editor.replace(dn.el.replace_input.value);
        if(e.shiftKey)
            dn.editor.findPrevious()
        else
            dn.editor.findNext();
        dn.do_find(dn.finding_str); 
        if(dn.find_result_markers.length){
            dn.el.find_replace_info.innerHTML = "Replaced " + n + " occurence" + (n>1? "s" : "") + ". <br>" +  dn.find_result_markers.length + " occurances remain<br>" +
             "Enter: replace current selection<br>Ctrl+Enter: replace all<br>Esc: hide the find/replace box<br>Tab: focus on find field";
        } else {
            dn.el.find_replace_info.innerHTML = "Replaced " + (n>1 ? "all " + n + " occurences" : "the 1 occurance") +
            ". <br> Nothing further to replace.<br>Esc: hide the find/replace box<br>Tab: focus on find field";
        }
    }
    if(e.which == WHICH.ESC){
        dn.blur_find_and_focus_editor(); 
        //the normal togglewidget shortcut will kick in
    }
}
*/




/*
dn.show_replace = function(){
    dn.showing_replace = true;
    dn.el.replace_form.style.display = '';
    var sel = dn.editor.session.getTextRange(dn.editor.getSelectionRange());
    dn.el.pane_find.style.display = '';
    if(sel)
        dn.el.find_input.value = sel;
    dn.el.find_input.focus()
    if(!sel)
        dn.el.find_input.select();
    return false;
}
*/