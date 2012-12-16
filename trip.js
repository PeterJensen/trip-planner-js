// ---------------------------------------------------------------------------
// Trip Planner - modules
// Author: Peter Jensen
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Small debug module
// ---------------------------------------------------------------------------

var debug = function () {

    var active = true;
    
    function log (msg) {
        if (active) {
            console.log (msg);
        }
    }
    
    return {
        log: log
    };
}();

// ---------------------------------------------------------------------------
// Module for accessing device
// ---------------------------------------------------------------------------

var trip_device = function () {

    var device_ready = false;
    
    function Has_Connection () {
        if (device_ready) {
            return navigator.connection.type !== Connection.NONE;
        }
        else {
            return true;
        }
    }
    
    function Set_Device_Ready () {
        device_ready = true;
    }
    
    return {
        Has_Connection:   Has_Connection,
        Set_Device_Ready: Set_Device_Ready
    }
}();
        
// ---------------------------------------------------------------------------
// Module for dropbox access utilities
// ---------------------------------------------------------------------------

var trip_dropbox = function () {

    var filename = "trip-json.txt";
    var key      = "RURiwwkE8TA=|qQAkOb3gEGScfJWqVvu3jRyCcnDVS0przH58574FvQ==";
    var client   = null;

    // default error handler, if none is provided
    function Show_Error (error) {
        debug.log ("Error accessing dropbox");
    }

    function Write_Data (data, Handle_Success, Handle_Error) {
        var hsuccess = (typeof Handle_Success !== "undefined") ? Handle_Success : null;
        var herror   = (typeof Handle_Error !== "undefined") ? Handle_Error : Show_Error;
        client.writeFile(filename, data, {noOverwrite:false}, function(error, stat) {
            if (error) {
                return herror (error);  // Something went wrong.
            }
            debug.log("File saved as revision " + stat.versionTag);
            if (hsuccess !== null) {
                Handle_Success (stat);
            }
        });
    }
    
    function Read_Data (Handle_Success, Handle_Error) {
        var hsuccess = (typeof Handle_Success !== "undefined") ? Handle_Success : null;
        var herror   = (typeof Handle_Error !== "undefined") ? Handle_Error : Show_Error;
        client.readFile(filename, Handle_Success, function (error, data) {
            if (error) {
                return herror (error);
            }
            debug.log("File read");
            if (hsuccess !== null) {
                hsuccess (data);
            }
        });
    }

    function Authenticate (Handle_Success, Handle_Error) {
        var hsuccess = (typeof Handle_Success !== "undefined") ? Handle_Success : null;
        var herror   = (typeof Handle_Error !== "undefined") ? Handle_Error : Show_Error;
        if (client === null) {
            client = new Dropbox.Client({key: key, sandbox: true});
            client.authDriver (new Dropbox.Drivers.Redirect({rememberUser:true}));
        }
        client.authenticate(function(error, lclient) {
            if (error) {
                return herror (error);
            }
            client.getUserInfo(function(error, user_info) {
                if (error) {
                    return herror(error);
                }
                debug.log ("Hello, " + user_info.name + "!");
                if (hsuccess !== null) {
                    hsuccess (user_info);
                }
            });
        });
    }
    
    return {
        Authenticate:     Authenticate,
        Write_Data:       Write_Data,
        Read_Data:        Read_Data
    };
    
}();


// ---------------------------------------------------------------------------
// Data model. trip_data keeps track of all trips and the lists and the
// current state of each item.  When data in this object change it is saved
// to local storage.  When changes happens the 'data' portion of the object
// is turned into a JSON string and stored in one key.  An efficiency
// improvement could be to split up the data in smaller portions that can be
// stored in smaller chunks.
// ---------------------------------------------------------------------------

var trip_data = function () {

    var local_key     = "trip_data";
    var trip_sync_key = "trip_sync";

    // --------------------------------------------------------------
    // named list indicies
    // --------------------------------------------------------------

    var to_bring = 0;
    var to_do    = 1;
    
    // --------------------------------------------------------------
    // Predefined lists
    // --------------------------------------------------------------
    
    var trip_templates = [
        {name: "Empty lists",
         to_bring: [],
         to_do:    []
        },
        {name: "Vacation trip",
         to_bring: ["Tickets", "Itineary", "Passport", "Cash", "Credit cards", "Books",
                    "Sunglasses", "Camera", "iPod/iPad", "Headset", "Contact lenses", "GPS",
                    "Running Shoes", "T-shirts", "Underwear", "Socks"],
         to_do:    ["Pay bills", "Lock doors", "Call taxi", "Setup Out-Of-Office", "Water plants"]},
        {name: "Business trip",
         to_bring: ["Ticket", "Passport", "Cash", "Credit cards", "Laptop", "Charger",
                    "Badge", "Notepad"],
         to_do:    ["Pay bills", "Lock doors", "Call taxi", "Setup Out-Of-Office", "Water plants"]}];
    
    // --------------------------------------------------------------
    // private data structure holding all the user data.  This data is
    // stored locally and can be synced to a dropbox account and will
    // persist between sessions
    // --------------------------------------------------------------

    var data = null;
/*    
    var data = {
        current_trip: 0,
        all_trips: [{
            name     : "Vacation - 2012",
            created  : "Sun Nov 18 2012 15:18:57 GMT-0800 (PST)",
            modified : "Sun Nov 18 2012 15:18:57 GMT-0800 (PST)",
            synced   : null,
            current_list: to_bring, // only used for 1 column displays
            lists    : [  // 0'th elem is to_bring, 1'st elem is to_do
                [
                   { checked: false,  descr: "Toothbrush" },
                   { checked: false, descr: "Wallet" },
                   { checked: false, descr: "iPod" },
                   { checked: false, descr: "Laptop" },
                   { checked: false, descr: "Charger" },
                   { checked: false, descr: "Underwear" },
                   { checked: false, descr: "Ticket" }
                ],
                [
                   { checked: false, descr: "Lock doors" },
                   { checked: false,  descr: "Flush toilet" },
                   { checked: false,  descr: "Brush teeth" }
                ]]
        }]
    };
*/
    // --------------------------------------------------------------
    // access and operations on trip data
    // --------------------------------------------------------------

    function Template_Names () {
        var names = [];
        for (var i = 0; i < trip_templates.length; ++i) {
            names.push (trip_templates [i].name);
        }
        return names;
    }
    
    function Template_Name (template_index) {
        return trip_templates [template_index].name;
    }
    
    function Trip_Names () {
        var names = [];
        for (var i = 0; i < data.all_trips.length; ++i) {
            names.push (data.all_trips [i].name);
        }
        return names;
    }
    
    function Trip_Count () {
        return data.all_trips.length;
    }
    
    function New_Trip (name, template_index) {
        var now  = new Date().toString ();
        var trip = {name: name, created: now, modified: now, synced: null, current_list: to_bring, lists: []};
        var to_bring_list = [];
        for (var i = 0; i < trip_templates[template_index].to_bring.length; ++i) {
            to_bring_list [i] = {checked: false, descr: trip_templates [template_index].to_bring [i]};
        }
        var to_do_list = [];
        for (var i = 0; i < trip_templates[template_index].to_do.length; ++i) {
            to_do_list [i] = {checked: false, descr: trip_templates [template_index].to_do [i]};
        }
        trip.lists [to_bring] = to_bring_list;
        trip.lists [to_do]    = to_do_list;
        data.all_trips.push (trip);
        Set_Current (data.all_trips.length - 1);
        Save_Local (); // Changes were made.  Save to local storage
    }
    
    function Delete_Trip () {
        if (data.all_trips.length > data.current_trip) {
            data.all_trips.splice (data.current_trip, 1);
        }
        if (data.current_trip > 0) {
            data.current_trip = data.current_trip - 1;
        }
        Save_Local ();
    }

    function Set_Current (trip_index) {
        data.current_trip = trip_index;
        Save_Local ();
    }
    
    function Set_Current_List (list_index) {
        data.all_trips [data.current_trip].current_list = list_index;
        Save_Local ();
    }
    
    function Trip_List_Current () {
        return data.all_trips [data.current_trip].current_list;
    }
    
    function Trip_Name_Current () {
        if (Trip_Count () > 0) {
            return data.all_trips [data.current_trip].name;
        }
        else {
            return "Trip Planner";
        }
    }
    
    function Trip_Name (trip_index) {
        return data.all_trips [trip_index].name;
    }    
    
    function List_Length (list_index) {
        if (data.all_trips.length == 0) {
            return 0;
        }
        return data.all_trips [data.current_trip].lists [list_index].length;
    }
    
    function Item_Descr (list_index, item_index) {
        return data.all_trips [data.current_trip].lists [list_index][item_index].descr;
    }
    
    function Is_Checked (list_index, item_index) {
        return data.all_trips [data.current_trip].lists [list_index][item_index].checked;
    }
    
    function Set_Checked (list_index, item_index, checked) {
        data.all_trips [data.current_trip].lists [list_index][item_index].checked = checked;
        Save_Local (); // change was made.  Save to local storage
    }
    
    function Toggle_Checked (list_index, item_index) {
        data.all_trips [data.current_trip].lists [list_index][item_index].checked =
            !data.all_trips [data.current_trip].lists [list_index][item_index].checked;
        Save_Local (); // change was made.  Save to local storage
    }
    
    function Add_Item (list_index, descr) {
        data.all_trips [data.current_trip].lists [list_index].unshift ({checked: false, descr: descr});
        Save_Local ();
    }
    
    function Delete_Item (list_index, item_index) {
        data.all_trips [data.current_trip].lists [list_index].splice (item_index, 1);
        Save_Local ();
    }
    
    function Save_Local () {
        var data_json = JSON.stringify (data);
        localStorage.setItem (local_key, data_json);
    }
    
    function Restore_Local () {
        var data_json = localStorage.getItem (local_key);
        if (data_json != null) {
            data = JSON.parse (data_json);
        }
        else {
            data = {current_trip: 0, all_trips: []}
        }
    }

    function Sync_In_Progress (new_value) {
        if (typeof new_value === "undefined") {
            var trip_sync = localStorage.getItem (trip_sync_key);
            return (trip_sync === null) ? false : trip_sync;
        }
        else {
            if (new_value === false) {
                localStorage.removeItem (trip_sync_key);
            }
            else {
                localStorage.setItem (trip_sync_key, new_value);
            }
            return new_value;
        }
    }

    function Save_Remote () {
        var sync = Sync_In_Progress ();
        if (sync !== false && sync !== "writing") {
            debug.log ("Syncing in progress.  Cannot save.  Try again later");
            return;
        }
        var data_json = JSON.stringify (data);
        Sync_In_Progress ("writing");
        trip_dropbox.Authenticate (function (user_info) {
            debug.log ("Writing authenticated");
            trip_dropbox.Write_Data (data_json, function () {
                debug.log ("Dropbox written");
                Sync_In_Progress (false);
            });
        });
    }
    
    function Restore_Remote (callback) {
        var sync = Sync_In_Progress ();
        if (sync !== false && sync !== "reading") {
            debug.log ("Syncing in progress.  Cannot restore. Try again later");
            return;
        }
        Sync_In_Progress ("reading");
        trip_dropbox.Authenticate (function (user_info) {
            debug.log ("Reading authenticated");
            trip_dropbox.Read_Data (function (data_json) {
                data = JSON.parse (data_json);
                debug.log ("Dropbox read");
                callback ();
                Sync_In_Progress (false);
            });
        });
    }
    
    function Sync_Remote (callback) {
        var sync = Sync_In_Progress ();
        if (sync === false) {
            return;
        }
        if (sync === "writing") {
            Save_Remote ();
        }
        else if (sync === "reading") {
            Restore_Remote (callback);
        }
    }
    
    return {
        to_bring:          to_bring,
        to_do:             to_do,
        Template_Names:    Template_Names,
        Template_Name:     Template_Name,
        Trip_Names:        Trip_Names,
        Trip_Count:        Trip_Count,
        New_Trip:          New_Trip,
        Delete_Trip:       Delete_Trip,
        Set_Current:       Set_Current,
        Set_Current_List:  Set_Current_List,
        Trip_List_Current: Trip_List_Current,
        Trip_Name_Current: Trip_Name_Current,
        Trip_Name:         Trip_Name,
        List_Length:       List_Length,
        Item_Descr:        Item_Descr,
        Is_Checked:        Is_Checked,
        Set_Checked:       Set_Checked,
        Toggle_Checked:    Toggle_Checked,
        Add_Item:          Add_Item,
        Delete_Item:       Delete_Item,
        Save_Local:        Save_Local,
        Restore_Local:     Restore_Local,
        Save_Remote:       Save_Remote,
        Restore_Remote:    Restore_Remote,
        Sync_Remote:       Sync_Remote
    };
} ();

// ---------------------------------------------------------------------------
// Module for UI creation
// ---------------------------------------------------------------------------

var trip_ui = function () {
    var ui = {
        unknown: {max_width: 0},
        small:   {max_width: 480},
        medium:  {max_width: 1024},
        large:   {max_width: 99999}
    }
    
    var ui_current = ui.unknown;
    
    function Ui_Decide () {
        var width = $(window).width ();
        if (width <= ui.small.max_width) {
            return ui.small;
        }
        else if (width <= ui.medium.max_width) {
            return ui.medium;
        }
        else {
            return ui.large;
        }
    }

    function Ui_Item_Id (list, index) {
        return "i" + list + "_" + index;
    }
    
    function Ui_Append_Item (jfields, list, i) {
        var id        = Ui_Item_Id (list, i);
        var jinput    = $("<input />").attr ("type", "checkbox").attr ("id", id);
        var jlabel    = $("<label></label>").attr("for", id).text(trip_data.Item_Descr(list, i));
        var jfieldset = $("<fieldset></fieldset>").attr ("data-role", "controlgroup").addClass ("trip-margin-none");
        var ja        = $("<a></a>")
                        .attr ("href", "#item")
                        .attr ("list", list)
                        .attr ("item", i)
                        .addClass ("trip-padding-none trip-border-none trip-padding-53");
        var jli       = $("<li></li>").attr ("data-icon", "delete").addClass ("trip-border-right-2");;
        jfieldset.append (jinput);
        jfieldset.append (jlabel);
        ja.append (jfieldset);
        jli.append (ja);
        
        ja.click (Ui_Handle_Item_Click);
        jinput.click (Ui_Handle_Item_Click);

        jinput.attr("checked", trip_data.Is_Checked(list, i));
        
        jfields.append (jli);
    }
    
    function Ui_Create_Fields (list, checked, unchecked) {
        var jfields = $("<ul></ul>")
                      .attr ("data-role", "listview")
                      .addClass ("trip-margin-none");

        // Create list of unchecked items
        if (unchecked) {
            for (var i = 0; i < trip_data.List_Length (list); ++i) {
                if (!trip_data.Is_Checked (list, i)) {
                    Ui_Append_Item (jfields, list, i);
                }
            }
        }
        // Create list of checked items
        if (checked) {
            for (var i = 0; i < trip_data.List_Length (list); ++i) {
                if (trip_data.Is_Checked (list, i)) {
                    Ui_Append_Item (jfields, list, i);
                }
            }
        }
        return jfields;
    }
    
    function Ui_Create_List_Header (header, list, left) {
        var jtitle  = $("<div></div>").addClass ("ui-bar-b ui-header");
        var jheader = $("<h1></h1>").text (header).addClass ("ui-title");
        var jadd    = $("<a></a>")
                      .attr ("href", "#i" + list + "new")
                      .attr ("data-icon", "plus")
                      .attr ("data-iconpos", "notext")
                      .attr ("data-rel", "popup")
                      .attr ("data-position-to", "window")
                      .attr ("data-inline", "true")
                      .attr ("data-transition", "pop")
                      .attr ("data-role", "button")
                      .addClass ("ui-btn-right")
                      .text ("Add");
        jtitle.append (jheader);
        jtitle.append (jadd);
        if (left !== null) {
            var jswitch = $("<a></a>")
                          .attr ("href", "#")
                          .attr ("data-icon", "false")
                          .attr ("data-inline", "true")
                          .attr ("data-role", "button")
                          .addClass ("ui-btn-left")
                          .text (left);
            jswitch.click (Ui_Handle_List_Switch);
            jtitle.append (jswitch);
        }
        return jtitle;
    }

    function Ui_Create_List (header, list, options) {
    
        // parse the options parameter - these are the defaults for the 'medium' UI
        var oleft      = null;  // default: Do not add left button
        var ochecked   = true;  // default: Create checked items
        var ounchecked = true;  // default: Create unchecked items
        var oheader    = true;  // default: Create header
        if (typeof options !== "undefined") {
            if (typeof options.left !== "undefined") {
                oleft = options.left;
            }
            if (typeof options.checked !== "undefined") {
                ochecked = options.checked;
            }
            if (typeof options.unchecked !== "undefined") {
                ounchecked = options.unchecked;
            }
            if (typeof options.header !== "undefined") {
                oheader = options.header;
            }
        }
        
        var jmain   = $("<div></div>");
        if (oheader) {
            var jtitle = Ui_Create_List_Header (header, list, oleft);        
            jmain.append (jtitle);
        }
        
        jfields = Ui_Create_Fields (list, ochecked, ounchecked);
        jmain.append (jfields);

        return jmain;
    }

    function Ui_Create_Small () {
        debug.log ("Creating small UI");
        
        // first remove the existing grid, if any
        $("#grid").remove ();
        
        var jgrid;
        
        jgrid = $("<div></div>")
                .attr ("id", "grid")
                .attr ("data-role", "content")
                .addClass ("trip-padding-none");
                
        jgrid.insertAfter ($('div [data-role="header"]'));

        var jlist;
        if (trip_data.Trip_List_Current () === trip_data.to_bring) {
            jlist = Ui_Create_List ("To Bring", trip_data.to_bring, {left: "To Do"});
        }
        else {
            jlist = Ui_Create_List ("To Do", trip_data.to_do, {left: "To Bring"});
        }
        
        // Add the newly created lists to the grid                
        jgrid.append (jlist);
        
        // Set the trip name
        $("#trip_name").text (trip_data.Trip_Name_Current ());
        
        // Recreate the page from jQuery Mobile (adds a bunch of sub-divs/spans)
        jgrid.trigger ("create");

        ui_current = ui.small;
    }
    
    function Ui_Create_Medium () {
        debug.log ("Creating medium UI");

        // first remove the existing grid, if any
        $("#grid").remove ();
        
        var jgrid;
        
        jgrid = $("<div></div>")
                .attr ("id", "grid")
                .attr ("data-role", "content")
                .addClass ("trip-padding-none ui-grid-a");
                
        jgrid.insertAfter ($('div [data-role="header"]'));

        var jto_bring = Ui_Create_List ("To Bring", trip_data.to_bring);
        var jto_do    = Ui_Create_List ("To Do", trip_data.to_do);
        
        jto_bring.addClass ("ui-block-a");
        jto_do.addClass ("ui-block-b");

        // Add the newly created lists to the grid                
        jgrid.append (jto_bring);
        jgrid.append (jto_do);
        
        // Set the trip name
        $("#trip_name").text (trip_data.Trip_Name_Current ());
        
        // Recreate the page from jQuery Mobile (adds a bunch of sub-divs/spans)
        jgrid.trigger ("create");
        ui_current = ui.medium;
    }
    
    function Ui_Create_Large () {
        debug.log ("Creating large UI");
        
        // first remove the existing grid, if any
        $("#grid").remove();
        
        var jgrid;

        // Create the outer grid
        jgrid = $("<div></div>")
                .attr ("id", "grid")
                .attr ("data-role", "content")
                .addClass ("trip-padding-none ui-grid-a");
        
        jgrid.insertAfter ($('div [data-role="header"]'));
        
        var jto_bring_unchecked = Ui_Create_List (null, trip_data.to_bring, {header: false, checked: false});
        var jto_bring_checked   = Ui_Create_List (null, trip_data.to_bring, {header: false, unchecked: false});
        var jto_do_unchecked    = Ui_Create_List (null, trip_data.to_do,    {header: false, checked: false});
        var jto_do_checked      = Ui_Create_List (null, trip_data.to_do,    {header: false, unchecked: false});
        
        jto_bring_unchecked.addClass ("ui-block-a");
        jto_bring_checked.addClass ("ui-block-b");
        jto_do_unchecked.addClass ("ui-block-a");
        jto_do_checked.addClass ("ui-block-b");
        
        jgrid_left  = $("<div></div>").addClass ("ui-block-a");
        jgrid_right = $("<div></div>").addClass ("ui-block-b");
        jleft_header  = Ui_Create_List_Header ("To Bring", trip_data.to_bring, null);
        jright_header = Ui_Create_List_Header ("To Do", trip_data.to_do, null);
        jgrid_left.append (jleft_header);
        jgrid_right.append (jright_header);
        jgrid.append (jgrid_left);
        jgrid.append (jgrid_right);
        jgrid_left.append (jto_bring_unchecked);
        jgrid_left.append (jto_bring_checked);
        jgrid_right.append (jto_do_unchecked);
        jgrid_right.append (jto_do_checked);
        
        jgrid.trigger ("create");

        // Set the trip name
        $("#trip_name").text (trip_data.Trip_Name_Current ());
        
        ui_current = ui.large;
    }
    
    function Ui_Create_Blank () {
        if ($(".trip-welcome").length > 0) {
            return;
        }

        var jgrid;
        
        // first remove the existing grid, if any
        $("#grid").remove();
        
        jgrid = $("<div></div>")
                .attr ("id", "grid")
                .attr ("data-role", "content")
                .addClass ("trip-welcome");
        jgrid.insertAfter ($('div [data-role="header"]'));
        jgrid.append ($("<h1>Welcome to Trip Planner</h1>"));
        jgrid.append ($("<span>Use the Menu button to create a new trip <br />or load an existing trip from your Dropbox</span>"));
        $("#trip_name").text ("Trip Planner");
        jgrid.trigger ("create");
    }

    function Ui_Create () {
        if (trip_data.Trip_Count () === 0) {
            Ui_Create_Blank ();
            return;
        }
        var this_ui = Ui_Decide ();
        switch (this_ui) {
            case ui.small:
                Ui_Create_Small ();
                break;
            case ui.medium:
                Ui_Create_Medium ();
                break;
            case ui.large:
                Ui_Create_Large ();
                break;
        }
    }

    // Dynamically create the 'New trip' dialog
    function Ui_Create_New_Dialog () {
        var jul = $("#trip_new ul");
        var template_names = trip_data.Template_Names ();
        for (i in template_names) {
            var jli = $("<li></li>").attr("data-icon", "false");
            var ja  = $("<a></a>").attr("href", "#").attr("item-index", i).text (template_names [i]);
            jli.append (ja);
            jul.append (jli);
            ja.click (Ui_Handle_Trip_New_Click);
        }
    }
    
    // Dynamicall create the 'Open trip' dialog
    function Ui_Create_Open_Dialog () {
        var trip_names = trip_data.Trip_Names ();
        $("#trip_open ul").remove ();
        // for some reason the .trigger() method doesn't properly update the <ul> and
        // it's content unless it's created from scratch here.
        var jul = $("<ul></ul>")
                 .attr("data-role", "listview")
                 .attr("data-inset", "true")
                 .attr("data-theme", "b")
                 .attr("data-icon", "false")
                 .addClass ("trip-dialog-inner");
        for (i in trip_names) {
            var jli = $("<li></li>").attr("data-icon", "false");
            var ja  = $("<a></a>").attr("href", "#").attr("item-index", i).text (trip_names [i]);
            jli.append (ja);
            jul.append (jli);
            ja.click (Ui_Handle_Trip_Open_Click)
        }
        $("#trip_open .trip-dialog").append (jul);
        $("#trip_open").trigger ("create");
    }

    // Handler for an item click
        
    function Ui_Handle_Item_Click (event) {
        debug.log ("Item_Check_Click: event on: " + event.target.localName);
        var jtarget = $(event.target);
        var ja     = jtarget.closest ("a");
        var list   = parseInt (ja.attr ("list"), 10);
        var item   = parseInt (ja.attr ("item"), 10);
        if (jtarget.is ("input")) {
            trip_data.Toggle_Checked (list, item);
        }
        if (jtarget.is ("a")) {
            trip_data.Delete_Item (list, item);
            Ui_Create ();
        }
    }
    
    function Ui_Handle_Trip_New_Click (event) {
        var jinput         = $("#trip_new_name");
        var ja             = $(event.target);
        var template_index = ja.attr ("item-index");
        var template_name  = trip_data.Template_Name (template_index);
        var trip_name      = $("#trip_new_name").val ();
        debug.log ("New trip: " + trip_name + " (" + template_name + ")");
        
        trip_data.New_Trip (trip_name, template_index);
        Ui_Create ();
         // New trips were added, so recreate the open and delete dialogs
        Ui_Create_Open_Dialog ();
        $("#trip_new").popup ("close");
    }
    
    function Ui_Handle_Trip_Open_Click (event) {
        var ja         = $(event.target);
        var trip_index = ja.attr ("item-index");
        var trip_name  = trip_data.Trip_Name (trip_index);
        debug.log ("Open trip: " + trip_name);
        
        trip_data.Set_Current (trip_index);
        Ui_Create ();
        $("#trip_open").popup ("close");
    }

    function Ui_Handle_Trip_Delete_Click (event) {
        if (trip_data.Trip_Count () > 0) {
            var jinput = $(event.target);
            var trip_name  = trip_data.Trip_Name_Current ();
            if (jinput.val () === "OK") {
                debug.log ("Delete trip: " + trip_name);
                trip_data.Delete_Trip ();
                Ui_Create ();
                Ui_Create_Open_Dialog ();
            }
        }
        $("#trip_delete").popup ("close");
    }
    
    function Ui_Handle_Dropbox_Save (event) {
        debug.log ("Saving to Dropbox");
        if (trip_device.Has_Connection ()) {
            trip_data.Save_Remote ();
        }
        else {
            debug.log ("No network connection");
            $("#main_menu").on({
                popupafterclose: function() {
                    setTimeout( function(){ $("#trip_no_network").popup("open") }, 100 );
                }});
        }
    }
    
    function Ui_Handle_Dropbox_Restore (event) {
        debug.log ("Restoring from Dropbox");
        if (trip_device.Has_Connection ()) {
			trip_data.Restore_Remote (function () {
				trip_data.Save_Local ();
				Ui_Create ();
				Ui_Create_Open_Dialog ();
			});
		}
		else {
		    debug.log ("No network connection");
            $("#main_menu").on({
                popupafterclose: function() {
                    setTimeout( function(){ $("#trip_no_network").popup("open") }, 100 );
                }});
        }
    }

    function Ui_Handle_No_Network_Click (event) {
        $("#trip_no_network").popup ("close");
    }

    function Ui_Handle_Resize (event) {
        var ui = Ui_Decide ();        
        if (ui != ui_current) {
            Ui_Create ();
        }
    }
    
    function Ui_Handle_List_Switch (event) {
        var current_list = trip_data.Trip_List_Current ();
        var new_list = current_list === trip_data.to_do ? trip_data.to_bring : trip_data.to_do;
        trip_data.Set_Current_List (new_list);
        Ui_Create ();
    }

    function Ui_New_Item_Input (popup_id, item_id, list) {
        var descr = $(item_id).val();
        debug.log("New_Item (" + item_id + "): " + descr);

        $(popup_id).popup("close");

        if (descr != null && descr != "") {
            trip_data.Add_Item (list, descr);
            Ui_Create ();
        }
    }
        
    return {
        Ui_Create:                   Ui_Create,
        Ui_Create_New_Dialog:        Ui_Create_New_Dialog,
        Ui_Create_Open_Dialog:       Ui_Create_Open_Dialog,
        Ui_New_Item_Input:           Ui_New_Item_Input,
        Ui_Handle_Resize:            Ui_Handle_Resize,
        Ui_Handle_Dropbox_Restore:   Ui_Handle_Dropbox_Restore,
        Ui_Handle_Dropbox_Save:      Ui_Handle_Dropbox_Save,
        Ui_Handle_No_Network_Click:  Ui_Handle_No_Network_Click,
        Ui_Handle_Trip_Delete_Click: Ui_Handle_Trip_Delete_Click
    }
}();

// ---------------------------------------------------------------------------
// main ()
// ---------------------------------------------------------------------------

$("#trip_main").live ('pagebeforecreate',
function (event) {
    
    // Main function
    function Main () {
        debug.log ("pagebeforecreate");
        
        // Restore existing trip data
        trip_data.Restore_Local ();  
        
        // Create the main UI
        trip_ui.Ui_Create ();
        
        // Create the 'New Trip' dialog
        trip_ui.Ui_Create_New_Dialog ();
    
        // Create the 'Open trip' dialog
        trip_ui.Ui_Create_Open_Dialog ();

        // Set the current trip name in the 'Delete trip' popup when opened
        $("#trip_delete").on ("popupbeforeposition", function () {
            if (trip_data.Trip_Count () > 0) {
                $("#trip_delete_name").text (trip_data.Trip_Name_Current ());
            }
            else {
                $("#trip_delete").popup ("close");
            }
        });
        
        // Handlers for new items
        $("#fbnew").submit (function () {
            trip_ui.Ui_New_Item_Input ("#i0new", "#to_bring_item", trip_data.to_bring);
            return false;
        });
        $("#fdnew").submit (function () {
            trip_ui.Ui_New_Item_Input ("#i1new", "#to_do_item", trip_data.to_do);
            return false;
        });
        
        // Handler for new trip
        $("#trip_new_form").submit (function (event) {
            var template = $("trip_template").val();
            debug.log("New Template: " + template);
            return false;
        });
        
        // Handler for delete trip
        $("#trip_delete input").click (trip_ui.Ui_Handle_Trip_Delete_Click);

        // Handler for Dropbox Save
        $("#main_menu a[href=#trip_save]").parent ().click (trip_ui.Ui_Handle_Dropbox_Save);
        
        // Handler for Dropbox Restore
        $("#main_menu a[href=#trip_restore]").parent ().click (trip_ui.Ui_Handle_Dropbox_Restore);
        
        // Handler for no network OK
        $("#trip_no_network input").click (trip_ui.Ui_Handle_No_Network_Click);
        
        // Handler for 'refresh'
        $("#trip_refresh").click (trip_ui.Ui_Create);

        // Handler for 'resize' event
        $(window).resize (trip_ui.Ui_Handle_Resize);
    }
    
    Main ();
});

$(function () {
    $(document).on ("deviceready", function () {
        console.log ("device ready");
        trip_device.Set_Device_Ready ();
    });
    trip_data.Sync_Remote (function () {
		trip_data.Save_Local ();
		trip_ui.Ui_Create ();
		trip_ui.Ui_Create_Open_Dialog ();
    });
});
