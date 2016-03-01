"use strict";

/*
The find focus/blur problem
============================

We have to work quite hard to give the user a good focus/blur experience.  The hooks for all the
behaviour are spread across various files, but we list all the cases here and the desired outcomes.

The main principle is that we only show results in the widget & mark them
in the editor when find_active is true.  And when this flag is true
we force the input to keep the focus, unless we have reason to let it go
back to the editor.

Setting find_active to false is fairly simple, and can be done with the
find_set_find_active_false() function.  Setting it to true is a bit more complciated:
it may have previously been false, or it may have already been true, and if true the search
 may not even need to be re-run. All three cases are dealt with by 
the find_set_find_active_true() function.

Here is a list of all the relevant actions that have to be considered, we label each with T/F, indicating
whether find_active should be true or false after the action:

(a)   T typing standard chars or backspace in input
(b)   T typing up/down or (Enter/Shift-Enter) in input
(c)   T clicking results in widget
(d.1) T clicking search settings buttons when find_active is true
(d.2) F clicking search settings buttons when find_active is false and search str is empty
(d.3) T clicking search settings buttons when find_active is false and search str is non-empty
(e.1) T using ctrl-f shortcut, possibly with find-pane already visible
(e.2) T^ using ctrl-f shorctut, possibly with find-pane already visible, with text selected
(f.1) T opening widget directly into find with Esc
(f.2) F open widget directly into find by clicking widget
(g)   T clicking, to select find pane, with widget already open
(h)   F g_settings remotely opening widget into find
(i)   F* pressing Esc with find_active true
(j)   F* ressing Esc or clicking the widget with find_active false, but find_pane showing
(k)   F pressing Tab with find_active true
(l.1) F switching to another pane with find_active true
(l.2) F switching to another pane with find_active false
(m)   F clicking editor (when find_active is true)
(n)   F g_settings remotely switch to another pane or close widget
(o)   T clicking the input

*for (j) and (i), we should close the widget as well as setting find_active to false.
^ for (e.2) we need to make set the search string to the selection

Two important callees of find_set_find_active_false() are the handlers for:
    g_settings.set('pane', <all_panes_except_find>) ...and...
    g_settings.set('pane_open', false)
This covers a number of the actions in the list above.


...and then we have to deal with replace input as well, but let's leave that for now!!
...and maybe evetunally the realtime document changes.

*/

dn.find_results = [];
dn.find_current_match_idx = -1;
dn.find_markers = [];
dn.find_marker_current = undefined;
dn.find_str = "";

dn.find_active = false; 

dn.find_set_find_active_false = function(){
    if(!dn.find_active)
        return;
    dn.find_active = false;

    // remove all markers
    var session = dn.editor.getSession();   
    for(var ii=0; ii<dn.find_markers.length; ii++)
        session.removeMarker(dn.find_markers[ii]);
    if (dn.find_marker_current !== undefined){
        session.removeMarker(dn.find_marker_current);
        dn.find_marker_current = undefined;
    }

    // reset widget display
    dn.el.find_info.textContent = dn.find_str === "" ? "type to search" : "search inactive";
    dn.el.find_results.innerHTML = "";

    // forget last search
    dn.find_markers = [];
    dn.find_results = [];
    dn.find_current_match_idx = -1;

    // forget last selection in input (in preparation for next time it gets focus)
    dn.el.find_input.setSelectionRange(dn.el.find_input.selectionEnd, dn.el.find_input.selectionEnd);

    // restore focus to editor
    dn.editor.setHighlightSelectedWord(true); // we had this on false during find
    dn.focus_editor();


    /*
    clearTimeout(dn.blur_find_and_focus_editor_timer);
    dn.blur_find_and_focus_editor_timer = 0;
    if(flag==="delay"){
        dn.blur_find_and_focus_editor_timer = setTimeout(dn.blur_find_and_focus_editor,10); //this gives the other input element time to cancel the closing if there is a blur-focus event when focus shifts
        return; //note that we are assuming here that the blur event is triggered on the first element *before* the focus is triggered on the second element..if that isn't guaranteed to be true we'd need to check whether the second element already has the focus when the first element gets its blur event.
    }
    */

}

dn.find_set_find_active_true = function(select_match_idx){
    /* There are three reasons this can be called:
        1. dn.find_active was previously false, and we now need to do everything from scratch
        2. dn.find_active was true, but the search stirng or settings have changed, so we
           need to re-run the search (which is almost identical to 1).
        3. find_active was true and we are just navigating through results rather than
           changing the search.  To select this option rather than 2, pass the select_match_idx
           as an argument. 
    */

    if(!dn.find_active){
        dn.find_active = true;
        dn.AceSearch = dn.AceSearch || ace.require("./search").Search;
        dn.AceRange = dn.AceRange || ace.require("./range").Range;
        dn.editor.setHighlightSelectedWord(false);
    }

    if(select_match_idx === undefined)
        dn.find_perform_search();
    else
        dn.find_select_result_idx(select_match_idx);

    dn.el.find_input.focus();
}

dn.find_perform_search = function(){
    // clear previous find (but leave selection for now)
    var session = dn.editor.getSession();   
    for(var ii=0; ii<dn.find_markers.length; ii++)
        session.removeMarker(dn.find_markers[ii]);
    if(dn.find_marker_current !== undefined){
        session.removeMarker(dn.find_marker_current)
        dn.find_marker_current = undefined;
    }
    dn.find_markers = [];
    dn.find_results = [];
    dn.find_current_match_idx = -1;
    dn.el.find_results.innerHTML = "";  
    
    var str = dn.find_str = dn.el.find_input.value; // we only store it to make it easier for key_down to check for true changes

    // If requested, try and parse as regex. On failure display no results with message.
    var use_reg_exp = dn.g_settings.get('find_regex');
    if(use_reg_exp){
        var re = undefined;
        try {
            re = new RegExp(str);
        } catch(e) {
            dn.el.find_info.textContent = escape_str(e.message); //TODO: could force first letter to lower case
        }
    }

    if(use_reg_exp && re === undefined){
        // failed regex, don't show any results
        dn.editor.selection.clearSelection();

    } else if(str == ""){
        // empty string (including empty regex), dont show any results
        dn.el.find_info.textContent = "type to search. " + dn.ctrl_key + "-up/down for history.";
        dn.editor.selection.clearSelection();
        
    } else {
        // valid regex or pure str search..

        // This is the actual search
        var search = new dn.AceSearch();
        search.setOptions({
            needle: use_reg_exp ? re : str,
            wrap: true,
            caseSensitive: dn.g_settings.get('find_case_sensitive'),
            wholeWord: dn.g_settings.get('find_whole_words'),
            regExp: use_reg_exp
        });
        var results = dn.find_results = search.findAll(session);

        if(results.length === 0){
            // No results to display, life is easy...
            dn.el.find_info.textContent = "no matches found.";
            dn.editor.selection.clearSelection();

        }else{
            // Right, we got some results ....

            // Work out which result we should consider the current match.
            var selected_range = session.getSelection().getRange();
            for(var ii=0; ii<results.length; ii++) 
                if(results[ii].end.row > selected_range.start.row  || 
                    (results[ii].end.row == selected_range.start.row &&
                     results[ii].end.column >= selected_range.start.column))
                break;
            var current_match_idx = (ii == results.length ? results.length-1 : ii);

            // Add markers into the editor to show *all* the results
            for(var ii=0; ii<results.length; ii++)
                dn.find_markers.push(session.addMarker(results[ii], "find_match_marker", "find_match_marker", false));

            // augment the results with their idx, this is useful for the subselection stuff
            for(var ii=0; ii<results.length; ii++)
                results[ii] = {range: results[ii], idx: ii};

            // Render a subset of the results into the widget and mark & select the current match
            dn.find_select_result_idx(current_match_idx);
        }

    }


    //dn.find_str = str;
    //if(dn.g_find_history && isNaN(dn.find_history_pointer)){
    //    if(dn.find_history_add_timeout)
    //        clearTimeout(dn.find_history_add_timeout);
    //    if(str.length)
    //        dn.find_history_add_timeout = setTimeout(function(){dn.add_to_find_history(str);},dn.find_history_add_delay)
    //}
}

dn.find_select_result_idx = function(current_match_idx){
    /* This is called within find_perform_search when a new search returns some results, it's also
       called when we move through the results without changing the search.   */

    // Get a small sub set of results to show in the widget.
    // We carefully implement some wrapping logic, which is a bit fiddly.
    dn.find_current_match_idx = current_match_idx;

    var session = dn.editor.getSession();
    if (dn.find_marker_current !== undefined){
        session.removeMarker(dn.find_marker_current);
        dn.find_marker_current = undefined;
    }

    var results = dn.find_results;
    var results_sub = [];
    
    if(results.length <= dn.find_max_results){
        results_sub = results;
    }else{
        var n = Math.floor(dn.find_max_results/2);
        if(current_match_idx < n){
            results_sub = results_sub.concat(results.slice(current_match_idx - n));
            results_sub = results_sub.concat(results.slice(0, current_match_idx));
        } else {
            results_sub = results_sub.concat(results.slice(current_match_idx - n, current_match_idx));
        }
        results_sub.push(results[current_match_idx]); 
        if(current_match_idx + n >= results.length){
            results_sub = results_sub.concat(results.slice(current_match_idx + 1));
            results_sub = results_sub.concat(results.slice(0, n + 1 - (results.length - current_match_idx)));
        } else {
            results_sub = results_sub.concat(results.slice(current_match_idx + 1, current_match_idx + n + 1));
        }
    }

    // Now lets build the html to show the subset of results in the widget
    var html = "";
    for(var ii=0; ii<results_sub.length; ii++){
        var row = results_sub[ii].range.start.row;
        var col = results_sub[ii].range.start.column;
        var prefix_range = new dn.AceRange(row, Math.max(0, col-dn.find_max_prefix_chars), row, col);
        var pre_ellipses = col > dn.find_max_prefix_chars; //TODO: deal with indent better
        row = results_sub[ii].range.end.row;
        col = results_sub[ii].range.end.column;
        var suffix_range = new dn.AceRange(row, col, row, col+dn.find_max_suffix_chars);
        html += "<div class='find_result_item" + (results_sub[ii].idx==current_match_idx? " find_result_current" : "") + "'>" +
                    "<div class='find_result_line_num'>" + (row+1) + "</div>" +
                    "<div class='find_result_text'>" +
                        "<div class='find_result_text_inner'>" +
                            (pre_ellipses ? "&#8230;" : "") + escape_str(session.getTextRange(prefix_range)) +
                            "<span class='find_result_match'>" + escape_str(session.getTextRange(results_sub[ii].range)) + "</span>" +
                            escape_str(session.getTextRange(suffix_range)) +
                        "</div>" +
                    "</div>" +
                "</div>";
    }
    dn.el.find_results.innerHTML = html;
    var els = dn.el.find_results.getElementsByClassName('find_result_item');
    for(var ii=0; ii<els.length; ii++) if(results_sub[ii].idx !== current_match_idx)
        els[ii].addEventListener('click', dn.find_result_click(results_sub[ii].idx));

    if(results.length > dn.find_max_results)
        dn.el.find_info.textContent = "... and " + (results.length - dn.find_max_results) + " more matches";
    else
        dn.el.find_info.textContent = "";

    // do the special marker for the current selection and actually select it
    dn.find_marker_current = session.addMarker(results[current_match_idx].range, "find_current_match_marker", "find_current_match_marker", false);
    dn.editor.selection.setSelectionRange(results[current_match_idx].range, false);
    dn.editor.renderer.scrollSelectionIntoView();
}


dn.find_blur_input = function(){
    dn.find_set_find_active_false();
}

dn.find_settings_changed = function(){
    // TODO: if the settings were changed remotely then we don't want to set find_active to true
    if(dn.g_settings.get('pane') === 'pane_find' && dn.g_settings.get('pane_open') &&  
        (dn.el.find_input.value || dn.find_active))
        dn.find_set_find_active_true();
}

dn.find_result_click = function(ii){
    return function(e){dn.find_set_find_active_true(ii);};
}

dn.find_input_focus = function(){
    if(!dn.find_active) // we have to test to prevent recursion
        dn.find_set_find_active_true();
}

dn.find_input_keydown = function(e){ 
    //we want keydown here so that we can get repeated firing with keydown (i think on most browsers)

    if ((e.which == WHICH.ENTER && !e.shiftKey) || (!e.ctrlKey && e.which == WHICH.DOWN)){
        //find next
        dn.find_set_find_active_true(dn.find_current_match_idx + 1 < dn.find_results.length ? 
                                    dn.find_current_match_idx + 1 
                                  : 0);
        e.preventDefault();
        return;
    }else if((e.which == WHICH.ENTER && e.shiftKey) || (!e.ctrlKey && e.which == WHICH.UP)){
        //find previous
        dn.find_set_find_active_true(dn.find_current_match_idx - 1 < 0 ? 
                                    dn.find_results.length -1 
                                  : dn.find_current_match_idx - 1);
        e.preventDefault();
        return;
    }

    if(e.which == WHICH.ESC){
        dn.find_set_find_active_false(); 
        dn.g_settings.set('pane_open', !dn.g_settings.get('pane_open'));
        e.preventDefault();
        return;   
    }
    /*                                 
    
        //the normal togglewidget shortcut will kick in
    }
    if(e.ctrlKey && (e.which == WHICH.UP || e.which == WHICH.DOWN)){
        if(isNaN(dn.find_history_pointer)){
            dn.add_to_find_history(dn.find_str);  //when we begin delving into history
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
    */


}


dn.find_input_keyup = function(e){ 
    //we need keyup here in order that the val has the new character or new backspace
    if(e.which == WHICH.ENTER || e.which == WHICH.ESC || e.which == WHICH.UP || e.which == WHICH.DOWN)
        return; 
    if(dn.find_str == dn.el.find_input.value)
        return;
    //if(dn.el.find_input.value != dn.find_str)
    //    dn.find_history_pointer = NaN;
    dn.find_set_find_active_true()
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


/*    
dn.find_input_focus = function(){
    dn.cancel_blur_find_and_focus_editor();
    dn.showing_find_results = true;
    if(dn.showing_replace)
        dn.el.replace_input.setAttribute("tabindex", parseInt(dn.el.find_input.getAttribute("tabindex"))+1); //we want to force the replace input to always be the next tab index
    dn.do_find(dn.find_str);
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
        dn.do_find(dn.find_str);
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
        dn.do_find(dn.find_str); 
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


/*
A "quick", no sorry, a "longish" note:
Each time DoFind runs it stores its str in dn.find_str for next time.
dn.find_history_pointer is nan except when we are cycling through history. As soon 
as we change the search string we leave this history-cyclying mode.  Also, immediately before
entering the history-cycling mode we store the current str at the top of the history so it's
available to come back to.
A search is added to the history if it's not the empty string and has not been modified for 
dn.find_history_add_delay milliseconds.
Dealing with focus is a bit of a pain.  Basically either of the two input boxes may have it
or a third party (such as he editor itself) may have it. We only want to show the markings
when one of the two input boxes has the focus and not otherwise.  Also, while the inputs have the focus
they disable the editor's steal-back-the-focus timer, which normally ensures it doesn't loose the focus.
So we need to make sure that timer is reneabled when the focus is with neither of the two inputs.
To make this work, whenver one of the inputs loses focus (the "blur" event) it triggers a delayed
call to BlurFindAndFocusEditor, the fact that it is delayed allows the other input to cancel
the call if it is the thing recieving the focus, otherwise it will go ahead.
There are other complications too, but this is the bulk of it.
*/
