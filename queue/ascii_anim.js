"use strict";

const Animation = {
	version: 0,
	width: 0,
	height: 0,
	speed: 1000,
	cycle: false,
	frames: []Frame
};

const Frame = {
	index: 0,
	body: ""
};

function runAnimation(target string) {}

function parseAnimation(raw string) {

}

/*	
	usage: ASCIIAnimation(param1, param2, param3)
	
	param1 - array of animation 'frames' (strings)
	param2 - speed of animation in ms
	param3 - DOM target, inserts animation to .innerHTML (retains spaces)
	
	ex: 
	var anim1 = new ASCIIAnimation(["1","2","3"], 100, div1);
*/

function ASCIIAnimation(animArray, speed, DOMtarget) {
  var currentFrame = 0;
	for(var i = 0; i < animArray.length; i++) {
		animArray[i] = animArray[i].replace(/ /g,"&nbsp;");
		animArray[i] = "<pre>" + animArray[i] + "</pre>";
	}
	DOMtarget.innerHTML = animArray[0];
	currentFrame++;
	this.animation = setInterval(function() {
		DOMtarget.innerHTML = animArray[currentFrame];
		currentFrame++;
		if(currentFrame >= animArray.length) currentFrame = 0;
	}, speed);
	this.getCurrentFrame = function() {
		return currentFrame;
	}
}

ASCIIAnimation.prototype.stopAnimation = function() {
	clearInterval(this.animation);
}

// EXAMPLES //

// (EXTRA STREAMLINING FLUFF FOR EXAMPLES)
document.body.style.textAlign = "center";
document.body.innerHTML = "<br /><br /><h1>ASCII animations are fun!</h1>";

function makeDiv() { return document.createElement("div"); }
function bodyAppend(element) { document.body.appendChild(element); }

//EX1:
var div1 = makeDiv();
bodyAppend(div1);
var animArray1 = [
	">   ", 
	" >  ", 
	"  > ", 
	"   >", 
	"   <", 
	"  < ", 
	" <  ",
	"<   "
];

var anim1 = new ASCIIAnimation(animArray1, 500, div1);

//EX2:
var div2 = makeDiv();
bodyAppend(div2);
div2.style.fontFamily = "monospace";
var animArray2 = ["///","|||","\\\\\\","|||"];

var anim2 = new ASCIIAnimation(animArray2, 100, div2);

//EX3:
var div3 = makeDiv();
bodyAppend(div3);
div3.style.fontFamily = "monospace";
var animArray3 = [".(^-^)'","-(^-^)-","'(^-^).","-(^o^)-",".(^-^)'","-(^-^)-","'(^-^).","-(^-^)-"];

var anim3 = new ASCIIAnimation(animArray3, 125, div3);

//EX4:
var div4 = makeDiv();
bodyAppend(div4);
div4.style.fontFamily = "monospace";
var animArray4 = [
	"[>    ]",
	"[>>   ]",
	"[>>>  ]",
	"[ >>> ]",
	"[  >>>]",
	"[   >>]",
	"[    >]",
	"[     ]"
];

var anim4 = new ASCIIAnimation(animArray4, 50, div4);

//EX5:
var div5 = makeDiv();
div5.style.height = "100px";
bodyAppend(div5);
var animArray5 = [
	"+--+\n" + 
	"|> |\n" +
	"|  |\n" +
	"+--+",
	"+--+\n" + 
	"| >|\n" +
	"|  |\n" +
	"+--+",
	"+--+\n" + 
	"| v|\n" +
	"|  |\n" +
	"+--+",
	"+--+\n" + 
	"|  |\n" +
	"| v|\n" +
	"+--+",
	"+--+\n" + 
	"|  |\n" +
	"| <|\n" +
	"+--+",
	"+--+\n" + 
	"|  |\n" +
	"|< |\n" +
	"+--+",
	"+--+\n" + 
	"|  |\n" +
	"|^ |\n" +
	"+--+",
	"+--+\n" + 
	"|^ |\n" +
	"|  |\n" +
	"+--+",
];

var anim5 = new ASCIIAnimation(animArray5, 1000, div5);