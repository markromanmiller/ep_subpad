'use strict';

const eejs = require('ep_etherpad-lite/node/eejs');
const padManager = require('ep_etherpad-lite/node/db/PadManager');
const db = require('ep_etherpad-lite/node/db/DB').db;
const bodyParser = require('ep_etherpad-lite/node_modules/body-parser');


exports.eejsBlock_editorContainerBox = function(hook_name, args, cb) {

	args.content = eejs.require("./templates/subpad_content.ejs", {}, module) + args.content;
	return cb();
}

exports.eejsBlock_styles = function(hookName, args, cb) {
	args.content += "<script src='../static/plugins/ep_subpad/static/js/jquery.min.js'></script>" +
		"<link href='../static/plugins/ep_subpad/static/css/jqtree.css' rel='stylesheet'>" +
		"<link href='../static/plugins/ep_subpad/static/css/subpad.css' rel='stylesheet'>";

	return cb();
};

exports.eejsBlock_scripts = function(hookName, args, cb) {
	args.content += "<script src='../static/plugins/ep_subpad/static/js/tree.jquery.js'></script>" + 
		"<script src='../static/plugins/ep_subpad/static/js/treesample.js'></script>";

	return cb();
}

function flattenSubpad(spObj) {
    return [spObj.name, (spObj.children ? flattenSubpads(spObj.children) : [])].flat();
}

function flattenSubpads(spArray) {
    return spArray.map(flattenSubpad).flat();
}

function removeSubpads(subpadTreeArray, subpadsToRemove) {
    return subpadTreeArray.map(function(treeEntry) {
        // it can turn into zero, one, or many.
        const children = "children" in treeEntry ? removeSubpads(treeEntry.children, subpadsToRemove) : [];
        if (subpadsToRemove.includes(treeEntry.name)) {
            return children;
        } else {
            if (children.length) {
                return [{
                    "name": treeEntry.name,
                    "children": children
                }]
            }
            return [{
                "name": treeEntry.name
            }]
        }
    }).flat(1);
}

function setDiff(a, b) {
    return a.filter(x => !b.includes(x));
}

async function padIDToLink(padID) {
	let title;
	try {
		title = await db.get("title:"+padID);
	} catch (error) {
		console.warn(error);
	}
	return `<a href='/p/${padID}'>${title ? title : padID}</a>`;
}

// gosh the naming sucks on this
function subpadConvert(subpads) {
	return Promise.all(subpads.map(async function(entry) {
		const result = {};
		result.name = await padIDToLink(entry.name);
		if ("children" in entry) {
			result.children = await subpadConvert(entry.children);
		}
		return result;
	}));
}

const linkToPadIDRegex = "<a href='\/p\/(.+)'>(.+)<\/a>";

function linkToPadID(linkText) {
	return linkText.match(linkToPadIDRegex)[1];
}

// gosh the naming sucks on this
function subpadSaveReady(subpads) {
	return subpads.map(function(entry) {
		const result = {};
		result.name = linkToPadID(entry.name);
		if ("children" in entry) {
			result.children = subpadSaveReady(entry.children);
		}
		return result;
	});
}

exports.expressConfigure = function(hookName, args) {
	//console.warn(bodyParser.json());
	//args.app.use(bodyParser.json());
	
}

const jsonParser = bodyParser.json();

function myJsonParser(...arr) {
	console.log(...arr);
	return jsonParser(...arr)
}

const urlencodedParser = bodyParser.urlencoded({
    extended: false
});


exports.registerRoute = function(hookName, args) {
	args.app.get('/subpad/subpad_tree_json', async (req, res) => {
		// get the pad list
		const allPads = await padManager.listAllPads();
		
		// get the subpad structure
		let subpad_specs = await db.get("subpad_specs");
		
		//console.log("PADS");
		//console.log(subpad_specs);

		const subpads_arranged = flattenSubpads(subpad_specs);
		
		// add missing pads to the end
		subpad_specs = subpad_specs.concat(setDiff(allPads.padIDs, subpads_arranged).map(function(x) {return {"name": x};}));
		//console.log(subpad_specs);

		// delete extraneous pads
		subpad_specs = removeSubpads(subpad_specs, setDiff(subpads_arranged, allPads.padIDs));
		//console.log(subpad_specs);
		//console.log(await subpadConvert(subpad_specs));

		// map the names to links and titles
		res.json(await subpadConvert(subpad_specs));
	});

	args.app.get('/subpad/test', (req, res) => {
		res.json({test: "works"});
	});
	
	args.app.get('/subpad/reset', (req, res) => {
		db.set("subpad_specs", []);
		res.json({"reset": "completed"});
	});
	args.app.get('/subpad/get', async (req, res) => {
		res.json(await db.get("subpad_specs"));
	});

	args.app.post('/subpad/subpad_tree_post', (req, res) => {
		let content = '';
		req.on('data', (data) => {
			// Append data.
			content += data;
		});
		req.on('end', () => {
			const parsed_content = JSON.parse(JSON.parse(content).tree);
			const saveReadyData = subpadSaveReady(parsed_content);
			//console.log(saveReadyData);
			db.set("subpad_specs", saveReadyData);

			res.json({"post": "completed"});
		});
	});

}
