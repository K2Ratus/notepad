"use strict";

/*
The find focus/blur problem.  This took some thinking to sort out!!!

In the end it is now relatively neat and simple to get your head around.

dn.g_settings.set('pane', 'pane_find') and dn.g_settings.set('pane_open', true)
do not mess with the focus themselves. Any code that uses that must explicitly
decide whether or not it wants to focus on the input for search/goto (a choice
which is made based on the flag dn.g_settings.get('find_goto')).

Calling  dn.g_settings.set('find_goto', bool), also does not mess with the focus, it
just renders the inactive version of goto/search.

We basically have the same setup for goto and for search, with goto having a less
meaty implementation, so it's easier to start by looking at that.

When the input gets the focus, the goto/search operation is performed, when the
input is blurred it sets the info text to "inactive".  If the blur events is moving the
focus to null, then at the end of the blur event we redirect the focus to the editor.

In keyboard.js there are special functions for producing exactly the right
focus behaviour when pressing Esc (with focus on the editor) and pressing 
Ctrl-F/Crtl-L.  
============================

Evetunally we may have to deal with the realtime document changes.

*/

dn.find_goto_changed = function(new_value){
    // This just toggles the display, it does not deal with focus/blur, which may happen afterwards
    // as a consequence if the relevant inputs previously had the focus.

    if(new_value){
        dn.el.find_goto_wrapper.style.display = '';
        dn.el.find_find_wrapper.style.display = 'none';
        dn.el.button_goto.classList.add('selected');
        dn.el.find_info.textContent = 'goto line inactive';
        dn.el.find_replace_wrapper.style.display = 'none';
    }else{
        dn.el.find_goto_wrapper.style.display = 'none';
        dn.el.find_find_wrapper.style.display = '';
        dn.el.button_goto.classList.remove('selected');
        dn.el.find_info.textContent = 'search inactive';
        if (dn.g_settings.get('find_replace'))
            dn.el.find_replace_wrapper.style.display = '';
    }
}

dn.find_replace_changed = function(new_value){
    if(new_value){
        dn.el.button_replace.classList.add('selected');
        if(!dn.g_settings.get('find_goto'))
            dn.el.find_replace_wrapper.style.display = '';
    }else{
        dn.el.find_replace_wrapper.style.display = 'none';
        dn.el.button_replace.classList.remove('selected');
    }
    if(dn.find_inputs_have_focus)
        dn.find_select_result_idx(dn.find_current_match_idx);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// goto :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// the implementation of goto is simpler than for search, so we start with it...

dn.find_goto_input_has_focus = false; // we don't actually need this, but we keep it for analogy with search

dn.find_goto_input_focus = function(){
    dn.find_goto_input_has_focus = true;
    dn.el.find_info.textContent = "type to goto line";
    dn.find_perform_goto();
}

dn.find_goto_input_blur = function(e){
    dn.find_goto_input_has_focus = false;
    dn.el.find_info.textContent = "goto line inactive"; 
    if(!e.relatedTarget)
        dn.focus_editor();
}

dn.find_perform_goto = function(){
    // called by find_goto_input_focus and find_goto_keyup
    var validated_str = dn.el.find_goto_input.value.replace(/[^\d]/,'');
    if (validated_str !== dn.el.find_goto_input.value)
        dn.el.find_goto_input.value = validated_str;
    if(validated_str === "")
        return;
    var num = parseInt(validated_str);
    dn.editor.gotoLine(num);
    dn.editor.navigateLineEnd();
}

dn.find_goto_input_keyup = dn.find_perform_goto; //alias

dn.find_goto_input_keydown = function(e){
    // keydown is fired repeatedly when key remains down
    if(e.which == WHICH.DOWN){
        dn.el.find_goto_input.value = parseInt(dn.el.find_goto_input.value.replace(/[^\d]/,''))+1;
        dn.find_perform_goto();
        e.preventDefault();
    }else if(e.which == WHICH.UP){
        dn.el.find_goto_input.value = parseInt(dn.el.find_goto_input.value.replace(/[^\d]/,''))-1;
        dn.find_perform_goto();
        e.preventDefault();
    } else if(e.which == WHICH.ESC){
        dn.g_settings.set('pane_open', false);
        e.preventDefault();
        e.stopPropagation();
    }
}


// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// search :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

dn.find_inputs_have_focus = false; // either find itself or replace
dn.find_results = [];
dn.find_current_match_idx = -1;
dn.find_markers = [];
dn.find_marker_current = undefined;
dn.find_str = "";

dn.find_inputs_focus = function(e){
    if(e.currentTarget == dn.el.find_input){
        dn.el.find_input.tabIndex = 101;
        dn.el.find_replace_input.tabIndex = 102;   
    } else {
        dn.el.find_input.tabIndex = 102;
        dn.el.find_replace_input.tabIndex = 101;   
    }
    if(dn.find_inputs_have_focus)
        return; // focus was transfered between replace/find inputs

    dn.find_inputs_have_focus = true;
    dn.AceSearch = dn.AceSearch || ace.require("./search").Search;
    dn.AceRange = dn.AceRange || ace.require("./range").Range;
    dn.editor.setHighlightSelectedWord(false);  
    dn.find_perform_search();
}

dn.find_inputs_blur = function(e){
    if(e.relatedTarget == dn.el.find_replace_input  || e.relatedTarget == dn.el.find_input)
        return; // focus is transfering between replace/find inputs

    dn.find_inputs_have_focus = false;

    // remove all markers
    var session = dn.editor.getSession();   
    for(var ii=0; ii<dn.find_markers.length; ii++)
        session.removeMarker(dn.find_markers[ii]);
    if (dn.find_marker_current !== undefined){
        session.removeMarker(dn.find_marker_current);
        dn.find_marker_current = undefined;
    }

    // reset widget display
    dn.el.find_info.textContent = "search inactive";
    dn.el.find_results.innerHTML = "";
    dn.el.find_info_overflow.textContent = "";

    // forget last search
    dn.find_markers = [];
    dn.find_results = [];
    dn.find_current_match_idx = -1;

    // forget last selection in input (in preparation for next time it gets focus)
    dn.el.find_input.setSelectionRange(dn.el.find_input.selectionEnd, dn.el.find_input.selectionEnd);

     // we had this on false during find
    dn.editor.setHighlightSelectedWord(true);

    if(!e.relatedTarget)
        dn.focus_editor();
}

dn.find_build_options = function(){
    var str = dn.el.find_input.value;
    var use_reg_exp = dn.g_settings.get('find_regex');
    var sensitive = dn.g_settings.get('find_case_sensitive');
    if(use_reg_exp){
        var re = undefined;
        re = new RegExp(str, sensitive ? "g" : "gi"); //cam throw error
    }
    return {
    needle: use_reg_exp ? re : str,
    wrap: true,
    caseSensitive: sensitive,
    wholeWord: dn.g_settings.get('find_whole_words'),
    regExp: use_reg_exp };
}

dn.find_perform_search = function(){
    // called by find_input_focus, find_settings_changed, and on keyup in the input, when text has changed

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
    dn.el.find_info_overflow.textContent = "";
    dn.el.find_info.textContent = "";
    dn.find_str = dn.el.find_input.value; // we only store it to make it easier for key_down to check for true changes

    var search_options = undefined;
    try{
        search_options = dn.find_build_options();
    } catch (e){
        dn.el.find_info.textContent = escape_str(e.message); //TODO: could force first letter to lower case
    }

    if(search_options === undefined){
        // failed regex, don't show any results
        dn.editor.selection.clearSelection();

    } else if(dn.find_str == ""){
        // empty string (including empty regex), dont show any results
        dn.el.find_info.textContent = "type to search. " /*+ dn.ctrl_key + "-up/down for history."*/;
        dn.editor.selection.clearSelection();
        
    } else {
        // valid regex or pure str search..

        // This is the actual search
        var search = new dn.AceSearch();
        search.setOptions(search_options);
        var results = dn.find_results = search.findAll(session);

        if(results.length === 0){
            // No results to display, life is easy...
            dn.el.find_info.textContent = "no matches found.";
            dn.el.find_info_overflow.textContent = "";
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

}

dn.find_select_result_idx = function(current_match_idx){
    // This is called within find_perform_search when a new search returns some results
    // it's also called when we move through the results without changing the search and
    // when replace_changed is called when find input already has the focus.   */

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
    
    var replace_is_showing = dn.g_settings.get('find_replace');

    var max_results = dn.find_max_results_half*2 + (replace_is_showing ? 0 : 1);

    if(results.length <= max_results){
        results_sub = results;
    }else{
        var n_pre = dn.find_max_results_half - (replace_is_showing ? 1 : 0);
        var n_post = dn.find_max_results_half;
        if(current_match_idx < n_pre){
            results_sub = results_sub.concat(results.slice(current_match_idx - n_pre));
            results_sub = results_sub.concat(results.slice(0, current_match_idx));
        } else {
            results_sub = results_sub.concat(results.slice(current_match_idx - n_pre, current_match_idx));
        }
        results_sub.push(results[current_match_idx]); 
        if(current_match_idx + n_post >= results.length){
            results_sub = results_sub.concat(results.slice(current_match_idx + 1));
            results_sub = results_sub.concat(results.slice(0, n_post + 1 - (results.length - current_match_idx)));
        } else {
            results_sub = results_sub.concat(results.slice(current_match_idx + 1, current_match_idx + n_post + 1));
        }
    }

    // Now lets build the html to show the subset of results in the widget
    var show_replace_buttons = dn.g_settings.get('find_replace');
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
                    (show_replace_buttons ? "<div class='button inline_button replace_single_result' title='replace'>r</div>" : "") + 
                "</div>";
    }
    dn.el.find_results.innerHTML = html;
    var els = dn.el.find_results.getElementsByClassName('find_result_item');
    for(var ii=0; ii<els.length; ii++) if(results_sub[ii].idx !== current_match_idx)
        els[ii].addEventListener('click', dn.find_result_click(results_sub[ii].idx));
    if(show_replace_buttons){
        var els = dn.el.find_results.getElementsByClassName('replace_single_result')
        for(var ii=0; ii<els.length; ii++)
            els[ii].addEventListener('click', dn.find_replace_result_click(results_sub[ii].idx));
    }

    if(results.length > max_results)
        dn.el.find_info_overflow.textContent = "... and " + (results.length - max_results) + " more matches";
    else
        dn.el.find_info_overflow.textContent = "";

    // do the special marker for the current selection and actually select it
    dn.find_marker_current = session.addMarker(results[current_match_idx].range, "find_current_match_marker", "find_current_match_marker", false);
    dn.editor.selection.setSelectionRange(results[current_match_idx].range, false);
    dn.editor.renderer.scrollSelectionIntoView();
}

dn.find_settings_changed = function(){
    if(dn.find_inputs_have_focus || 
       (dn.g_settings.get('pane') === 'pane_find' && dn.g_settings.get('pane_open') &&  dn.el.find_input.value))
        dn.find_perform_search();
}

dn.find_result_click = function(ii){
    // this can only be called while find input has the focus
    return function(e){dn.find_select_result_idx(ii);};
}

dn.find_replace_result_click = function(ii){
    return function(e){
        dn.find_replace_result_idx(ii);
        e.stopPropagation(); // prevent selecting item
    }
}

dn.find_input_keyup = function(e){ 
    //we need keyup here in order that the val has the new character or new backspace
    if(e.which == WHICH.ENTER || e.which == WHICH.ESC || e.which == WHICH.UP || e.which == WHICH.DOWN)
        return; 
    if(dn.find_str == dn.el.find_input.value)
        return;
    dn.find_perform_search()
}

dn.find_input_keydown = function(e){ 
    // we want keydown here so that we can get repeated firing with keydown (i think on most browsers)

    if ((e.which == WHICH.ENTER && !e.shiftKey) || (!e.ctrlKey && e.which == WHICH.DOWN)){
        //find next
        dn.find_select_result_idx(dn.find_current_match_idx + 1 < dn.find_results.length ? 
                                    dn.find_current_match_idx + 1 
                                  : 0);
        e.preventDefault();
        return;
    }else if((e.which == WHICH.ENTER && e.shiftKey) || (!e.ctrlKey && e.which == WHICH.UP)){
        //find previous
        dn.find_select_result_idx(dn.find_current_match_idx - 1 < 0 ? 
                                    dn.find_results.length -1 
                                  : dn.find_current_match_idx - 1);
        e.preventDefault();
        return;
    }

    if(e.which == WHICH.ESC){
        dn.g_settings.set('pane_open', false); // this focuses on the editor, and blurs the find_input
        e.preventDefault();
        e.stopPropagation();
        return;   
    }

}

dn.find_replace_input_keydown = function(e){
    if(e.which == WHICH.ENTER){
        if(e.ctrlKey || e.shiftKey)
            dn.find_replace_all();
        else
            dn.find_replace_result_idx(dn.find_current_match_idx);
        e.preventDefault();
    }else{
        dn.find_input_keydown(e); // up, down results and esc
    }
}

dn.find_replace_all = function(e){
    try{
        var options = dn.find_build_options();
    } catch (e) {
        dn.show_error(e.message);
        return;
    }
    dn.editor.replaceAll(dn.el.find_replace_input.value, options);
    dn.focus_editor();
}

dn.find_replace_click = dn.find_replace_all; //alias

dn.find_replace_result_idx = function(idx){
    var range = dn.find_results[idx].range;
    // we use undocumented ACE API to avoid messing around tryinng to force it to use the exact range we wanted
    dn.editor.$search.set(dn.find_build_options()); //this is needed so that $tryReplace knows what to do with regex'es
    dn.editor.$tryReplace(range, dn.el.find_replace_input.value) // returns true on success, but do we care?
    dn.find_perform_search();
}