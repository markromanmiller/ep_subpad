var padtree = $('#tree1');

padtree.tree({
		autoEscape: false,
		autoOpen: 0,
		dragAndDrop: true
});

// when the tree changes
// post back to the server

padtree.on(
    'tree.move',
    function(event)
    {
        event.preventDefault();
        // do the move first, and _then_ POST back.
        event.move_info.do_move();
	console.log("sending tree data");
        $.post('/subpad/subpad_tree_post', JSON.stringify({tree: $(this).tree('toJson')}), null, "json");
    }
);


// use $(tree_element).tree('toJson')
// and also remove all the is_open tags.
