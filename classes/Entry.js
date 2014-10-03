// define State class
function State () {
	this._stateName = "";
}

State.prototype = {
	OnEnter: function() {
		this._root = new THREE.Object3D();
		scene.add( this._root );
	},

	OnExit: function() {
		scene.remove( this._root );
	},

	Update: function(dt) {

	}
};


function StateFirst () {
	this._stateName = "StateFirst";

	this._mcamCounter = 0;
}

StateFirst.prototype = new State();

StateFirst.prototype.OnEnter = function () {
	State.prototype.OnEnter.call( this );

	this.SetCamera();
	this.CreateMap();
}

StateFirst.prototype.Update = function (dt) {
	State.prototype.Update.call(this, dt);

	this.MoveCamera();
}

StateFirst.prototype.SetCamera = function(){
	camera = new THREE.PerspectiveCamera(
		75, 
		window.innerWidth / window.innerHeight, 
		1, 
		1000);
	console.log( camera );
	var lookat = new THREE.Vector3( 0, -20, 22 );
	camera.lookAt( lookat );
	camera.position.set( 0, 10, 10 );
	scene.add( camera );
}

StateFirst.prototype.CreateMap = function () {
	// create floor
	var floor = new THREE.Object3D();
	this._root.add( floor );
	this._floor = floor;

	var floorTexture = new THREE.ImageUtils.loadTexture( 'resources/textures/floor_light.png' );
	floorTexture.wrapS = THREE.RepeatWrapping;
	floorTexture.wrapT = THREE.RepeatWrapping;
	floorTexture.repeat.set( 1, 5 );
	var geometry = new THREE.PlaneGeometry( 30, 500 );
	var material = new THREE.MeshBasicMaterial( {map: floorTexture, side: THREE.DoubleSide, transparent: true, overdraw: true} );
	var plane = new THREE.Mesh( geometry, material );
	plane.rotateX(THREE.Math.degToRad(90));

	floor.add( plane );

	var sideTexture = new THREE.ImageUtils.loadTexture( 'resources/textures/wall_direction.png' );
	sideTexture.wrapS = THREE.RepeatWrapping;
	sideTexture.wrapT = THREE.RepeatWrapping;
	sideTexture.repeat.set( 1, 50 );
	geometry = new THREE.PlaneGeometry( 5, 500 );
	material = new THREE.MeshPhongMaterial( { map: sideTexture, side: THREE.DoubleSide, transparent: true, overdraw: true } );
	side = new THREE.Mesh( geometry, material );
	side.rotateX(THREE.Math.degToRad(90));

	side.rotateY(THREE.Math.degToRad(90));
	side.position.y = 5;
	side.position.x = 15;
	floor.add(side);

	var side2 = side.clone();
	side2.position.x = -15;
	floor.add(side2);

	var titleTexture = new THREE.ImageUtils.loadTexture( 'resources/textures/title.png' );
	titleTexture.wrapS = THREE.RepeatWrapping;
	titleTexture.wrapT = THREE.RepeatWrapping;
	titleTexture.repeat.set( 1, 1 );
	var geometry = new THREE.PlaneGeometry( 8, 8 );
	var material = new THREE.MeshBasicMaterial( {map: titleTexture, side: THREE.DoubleSide, transparent: true, overdraw: true} );
	var title = new THREE.Mesh( geometry, material );

	title.position.set(0,0,-5);
	//title.rotateY(THREE.Math.degToRad(180));

	camera.add( title );
}

StateFirst.prototype.MoveCamera = function(){
	this._mcamCounter += 0.02;
	camera.position.y = 10 + Math.sin(this._mcamCounter) * 1;
}





var LINE_WIDTH = 10;
var ENEMY_BLANK = 0;
var ENEMY_WALL = 1;
var ENEMY_BURSTER = 2;
var globalPlayer, controls;
var globalEffect;

function StateGame () {
	this._stateName = "StateGame";

	this._speedUpTimer = 0;

	this._itemGenTimer = 0;
	this._genTimer = 0;
	this._player = undefined;
	this._effect = undefined;
	this._liveTime = 0;
	this._coinCount = 0;

	this._enemies = [];
	this._items = [];
	this._climates = [];
}

StateGame.prototype = new State();

StateGame.prototype.OnEnter = function () {
	State.prototype.OnEnter.call( this );

	this.CreateObjectPool();
	this.CreateMap();
	this.CreatePlayer();
	this.CreateEffectPlane();

	var ui_score = document.getElementById('score');
	this._labelScore = ui_score;
}

var TotalScore = 0;
var currScore = 0;
StateGame.prototype.Update = function (dt) {
	State.prototype.Update.call(this, dt);

	TWEEN.update();
	if ( controls !== undefined ) {
		controls.update();
	}

	this._liveTime += dt;
	TotalScore = parseInt(this._liveTime) * 100 + this._coinCount * 200;
	currScore += (TotalScore - currScore) / 10;
	this._labelScore.innerHTML = "Score : " + parseInt(currScore + 1);


	// move floor and adjust position of that
	var speed = 50 * dt;
	var dx = -1 * Math.sin(this._player.rotation.y) * speed;
	var dz = -1 * Math.cos(this._player.rotation.y) * speed;
	this._player.position.x += dx;
	this._player.position.z += dz;
	this._player.position.x = Math.min( LINE_WIDTH * 1.5, this._player.position.x );
	this._player.position.x = Math.max( -LINE_WIDTH * 1.5, this._player.position.x );

	if( this._player.position.z - this._floor.position.z > 100 ) {
		this._floor.position.z += 50;
	}

	// leveling
	this._speedUpTimer += dt;
	if( this._speedUpTimer > 0.2 ) {
		this._speedUpTimer = 0;
		this._player._speed = Math.min( 60, this._player._speed * 1.001 );
	}

	// create enemy each time
	this._genTimer += dt;
	if( this._genTimer > 2.0 ) {
		this._genTimer = 0;

		this.CreateEnemy();
	}

	this._itemGenTimer += dt;
	if( this._itemGenTimer > 1.0 ) {
		this._itemGenTimer = 0;
		this.CreateItem();
	}

	this.CreateClimate();
	this.RemoveFarClimate();
	// console.log( this._climate.length + ' ' + this._items.length + ' ' + this._enemies.length );

	this.ProcessInput(dt);
	this.RemoveFarObject();
	this.CollisionCheck();
}

StateGame.prototype.CreateObjectPool = function () {
	var op = {
		_coins: [],
		_enemies: [],
		_climates: [],
		_coinTexture: new THREE.ImageUtils.loadTexture( 'resources/textures/coin.png' ),

		BorrowCoin: function () {
			if( this._coins.length === 0 ) {
				var coinGeometry = new THREE.BoxGeometry( 2.5, 2.5, 2.5 );
				var coinMat = new THREE.MeshPhongMaterial( { map: op._coinTexture, 
					side: THREE.DoubleSide, 
					transparent: true, 
					overdraw: true } );
				var coinMesh = new THREE.Mesh( coinGeometry, coinMat );
				coinGeometry.computeBoundingBox();
				this._coins.push( coinMesh );
			}

			var ret = this._coins[ this._coins.length - 1 ];
			this._coins.pop();

			return ret;
		},
		PayBackCoin: function (obj) {
			this._coins.push( obj );
		},

		BorrowEnemy: function () {
			if( this._enemies.length === 0 ) {
				var enemyGeometry = new THREE.BoxGeometry( LINE_WIDTH, 30, 1 );
				var enemyMat = new THREE.MeshLambertMaterial( { color: 0xFF0000 } );
				var enemyMesh = new THREE.Mesh( enemyGeometry, enemyMat );
				enemyGeometry.computeBoundingBox();

				this._enemies.push( enemyMesh );
			}

			var ret = this._enemies[ this._enemies.length - 1 ];
			this._enemies.pop();

			return ret;
		},
		PayBackEnemy: function (obj) {
			this._enemies.push( obj );
		},

		BorrowClimate: function () {
			if( this._climates.length === 0 ) {
				var geometry = new THREE.BoxGeometry( .1, .1, THREE.Math.randInt(1, 4) );
				var material = new THREE.MeshBasicMaterial( { color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: THREE.Math.randInt(0, 5) / 40 } );
				var mesh = new THREE.Mesh( geometry, material );
				this._climates.push( mesh );
			}

			var ret = this._climates[ this._climates.length - 1 ];
			this._climates.pop();

			return ret;
		},
		PayBackClimate: function (obj) {
			this._climates.push( obj );
		}
	};

	this._objectPool = op;
}

StateGame.prototype.CreateMap = function () {
	// create floor
	var floor = new THREE.Object3D();
	this._root.add( floor );
	this._floor = floor;

	var floorTexture = new THREE.ImageUtils.loadTexture( 'resources/textures/floor_light.png' );
	floorTexture.wrapS = THREE.RepeatWrapping;
	floorTexture.wrapT = THREE.RepeatWrapping;
	floorTexture.repeat.set( 1, 10 );
	var geometry = new THREE.PlaneGeometry( 30, 1000 );
	var material = new THREE.MeshBasicMaterial( {map: floorTexture, side: THREE.DoubleSide, transparent: true, overdraw: true} );
	var plane = new THREE.Mesh( geometry, material );
	plane.rotateX(THREE.Math.degToRad(90));

	floor.add( plane );

	var sideTexture = new THREE.ImageUtils.loadTexture( 'resources/textures/wall_direction.png' );
	sideTexture.wrapS = THREE.RepeatWrapping;
	sideTexture.wrapT = THREE.RepeatWrapping;
	sideTexture.repeat.set( 1, 100 );
	geometry = new THREE.PlaneGeometry( 5, 1000 );
	material = new THREE.MeshPhongMaterial( { map: sideTexture, side: THREE.DoubleSide, transparent: true, overdraw: true } );
	side = new THREE.Mesh( geometry, material );
	side.rotateX(THREE.Math.degToRad(90));

	side.rotateY(THREE.Math.degToRad(90));
	side.position.y = 5;
	side.position.x = 15;
	floor.add(side);

	var side2 = side.clone();
	side2.position.x = -15;
	floor.add(side2);
}

var collided = false;
StateGame.prototype.CreateEffectPlane = function () {
	var pos = camera.position;

	var light = new THREE.PointLight( 0xFFFFFF, .3, 5 );
	light.position.set( 0, 0, 0 );
	camera.add( light );

	var effect_texture = new THREE.ImageUtils.loadTexture( 'resources/textures/effect_hit.png' );
	effect_texture.wrapS = THREE.RepeatWrapping;
	effect_texture.wrapT = THREE.RepeatWrapping;
	effect_texture.repeat.set( 1, 1 );

	var effect_texture2 = new THREE.ImageUtils.loadTexture( 'resources/textures/icon_coin.png' );
	effect_texture2.wrapS = THREE.RepeatWrapping;
	effect_texture2.wrapT = THREE.RepeatWrapping;
	effect_texture2.repeat.set( 1, 1 );

	var geoHeight = 1.6;
	var geoWidth = geoHeight * camera.aspect;

	var geometry = new THREE.PlaneGeometry( geoHeight, geoWidth );
	var material = new THREE.MeshPhongMaterial( {map:effect_texture, transparent: true, side: THREE.DoubleSide, opacity:0, specular: 0xffffff} );
	this._effect = new THREE.Mesh( geometry, material );
	this._effect.effect_texture = effect_texture;
	this._effect.effect_texture2 = effect_texture2;

	this._effect.rotateZ(THREE.Math.degToRad(90));
	this._effect.position.set(0,0,pos.z - 2.01);
	globalEffect = this._effect;

	this._effect.showEffect = function(effect, length){
		/* effect
		*	1. hit
		*	2. coin
		*/

		if(effect == "hit"){

			console.log(this);
			this.scale.x = 1;
			this.scale.y = 1;

			this.position.x = 0;
			this.position.y = 0;
			this.position.z = camera.position.z - 2.01;

			this.rotation.y = 0;

			this.material.map = effect_texture
			this.material.opacity = 0.9;

			var tween = new TWEEN.Tween( this.material )
				.to( { opacity: 0 }, length )
				.start();
		}else if(effect == "coin"){
			this.scale.x = 0.3;
			this.scale.y = 0.3 / camera.aspect;

			this.material.map = effect_texture2;
			this.material.opacity = 1;

			this.position.y = -0.5;
			this.position.x = 0;
			this.position.z = camera.position.z - 3;

			this.rotation.y = 0;

			var tween = new TWEEN.Tween( this.material )
				.to( { 
					opacity: 0,
				 }, length )
				.onUpdate(function(){
					globalEffect.position.y += 0.01;
					globalEffect.rotation.y += 0.3;
				})
				.start();
		}
	}

	this._effect.shakeCamera = function(length){
		var scope = 10;
		var tween = new TWEEN.Tween( camera.position )
			.to( { x: 0, y: 5 }, length )
			.onUpdate(function () {
				camera.position.x = THREE.Math.randInt(1, scope) - (scope / 2);
				camera.position.y = THREE.Math.randInt(1, scope) - (scope / 2) + 5;
				if (scope > 2) {
					scope--;
				}
			})
			.onComplete(function() {
				camera.position.x = 0;
				camera.position.y = 5;
			})
			.start();
	}
	
	camera.add(this._effect);
}

StateGame.prototype.CreatePlayer = function () {
	var geometry = new THREE.BoxGeometry( 2, 4, 4 );
	var material = new THREE.MeshLambertMaterial( { color: 0x00FF00, transparent: true, opacity: 0 } );
	var mesh = new THREE.Mesh( geometry, material );
	mesh.position.set( 0, 2, 0 );
	this._root.add( mesh );
	this._player = mesh;
	this._player.geometry.computeBoundingBox();
	this._player._speed = 40;
	globalPlayer = this._player;

	var light = new THREE.PointLight( 0xFFFFFF, 2, 100 );
	light.position.set( 0, 20, 0 );
	this._player.add( light );

	camera = new THREE.PerspectiveCamera(
		75, 
		window.innerWidth / window.innerHeight, 
		1, 
		1000);
	this._player.add( camera );
	console.log( camera );
	var lookat = new THREE.Vector3( 0, -0.1, -1 );
	camera.lookAt( lookat );
	camera.position.set( 0, 5, 1 );

	if( CardBoardSystemOn ) {
		var hasOrientation = function(evt) {
			var absolute = evt.absolute;
			var alpha	= evt.alpha;
			var beta	= evt.beta;
			var gamma	= evt.gamma;

			if (!alpha) {
				return;
			}
			window.removeEventListener('deviceorientation', hasOrientation);
			controls = new THREE.DeviceOrientationControls( globalPlayer );
			controls.connect();
			globalPlayer.rotation.y = Math.PI;
		};
		window.addEventListener('deviceorientation', hasOrientation);
	}
	else {
		this._player.rotation.y = Math.PI;
	}
}

StateGame.prototype.CreateClimate = function () {
	var pos = this._player.position;
	var wind = this._objectPool.BorrowClimate();
	wind.position.set( THREE.Math.randInt(0, 30) - 15, THREE.Math.randInt(3, 12), pos.z + 20 );
	this._root.add( wind );
	this._climates.push( wind );
}

StateGame.prototype.CreateEnemy = function () {
	// make sure that create enemy each type
	var lineArr = [ -1, -1, -1 ];
	var type = lineArr.length - 1;
	while (true) {
		var line = THREE.Math.randInt( 0, 2 );
		if( lineArr[line] === -1 ) {
			lineArr[line] = type;
			type--;
		}

		var count = 0;
		for( var i = 0; i < lineArr.length; i ++ ) {
			if( lineArr[i] === -1 ) {
				count ++;
			}
		}

		if( count === 0 ) {
			break;
		}
	}

	// now create enemy!
	for( var i = 0; i < lineArr.length; i ++ ) {
		if( lineArr[i] === 0 ) {
			continue;
		}

		var pos = this._player.position;
		var enemy = this._objectPool.BorrowEnemy();
		enemy.position.set( (i - 1) * LINE_WIDTH, 15, pos.z + 200 );
		enemy._type = lineArr[i];
		this._root.add( enemy );

		if( lineArr[i] === ENEMY_BURSTER ) {
			// below code should be changed.... in later....
			enemy.position.y = -25;
			enemy.Burst = function (enemy) {
				var newPos = enemy.position.clone();
				newPos.y += 40;

				if( enemy.tween !== undefined ) {
					enemy.tween.stop();
				}

				var tween = new TWEEN.Tween( enemy.position )
					.to( newPos, 1000 )
					.easing( TWEEN.Easing.Elastic.InOut )
					.start();
				enemy.tween = tween;

            	enemy._bursted = true;
			}
			enemy._bursted = false;
		}

		this._enemies.push( enemy );
	}
}

StateGame.prototype.CreateItem = function () {
	var lineArr = [ 1, 1, 1 ];
	lineArr[ THREE.Math.randInt( 0, lineArr.length - 1 ) ] = 0;
	for( var i = 0; i < lineArr.length; i ++ ) {
		if( lineArr[i] === 0 ) {
			continue;
		}

		var item = this._objectPool.BorrowCoin();
		if( item.tween !== undefined ) {
			item.tween.stop();
		}

		item.OnCollide = function (item) {
			stateManager._curr._coinCount++;
		}

		item.position.set( (i - 1) * LINE_WIDTH, 3, this._player.position.z + 110 );
		this._root.add( item );
		this._items.push( item );

		var values_x = [ 240, -240 ];
		var values_y = [ 180, -180 ];
		var values_z = [ 300, -300 ];
		var tween = new TWEEN.Tween( item.rotation );
		tween.to( 
			{ 
				x: values_x[ THREE.Math.randInt(0, values_x.length - 1) ], 
				y: values_y[ THREE.Math.randInt(0, values_y.length - 1) ], 
				z: values_z[ THREE.Math.randInt(0, values_z.length - 1) ]
			}, 
			THREE.Math.randInt( 130000, 150000 ) );
		tween.start();
		item.tween = tween;
	}
}

StateGame.prototype.ProcessInput = function (dt) {
	if( keyboard.pressed('left') ) {
		this._player.position.x += 30 * dt;
		this._player.position.x = Math.min( LINE_WIDTH * 1.5, this._player.position.x );
	}
	if( keyboard.pressed('right') ) {
		this._player.position.x += -30 * dt;
		this._player.position.x = Math.max( -LINE_WIDTH * 1.5, this._player.position.x );
	}

	if( CardBoardSystemOn ) {

	}
}

StateGame.prototype.RemoveFarObject = function () {
	var removeList = [];

	var pz = this._player.position.z;
	for (var i = this._enemies.length - 1; i >= 0; i--) {
		var enemy = this._enemies[i];
		var ez = enemy.position.z;
		if( pz - ez > 50 ) {
			removeList.push( enemy );
			enemy._type = 0;
		}
	};
	for (var i = this._items.length - 1; i >= 0; i--) {
		var item = this._items[i];
		var ez = item.position.z;
		if( pz - ez > 50 ) {
			removeList.push( item );
			item._type = 1;
		}
	};

	for (var i = removeList.length - 1; i >= 0; i--) {
		var obj = removeList[i];
		if( obj._type === 0 ) {
			var index = this._enemies.indexOf( obj );
			this._enemies.splice( index, 1 );
			this._objectPool.PayBackEnemy( obj );
		}
		else if( obj._type === 1 ) {
			var index = this._items.indexOf( obj );
			this._items.splice( index, 1 );
			this._objectPool.PayBackCoin( obj );
		}

		this._root.remove( obj );
	};
}

StateGame.prototype.CollisionCheck = function () {
	var playerBoundingBox = this._player.geometry.boundingBox.clone();
	playerBoundingBox.translate( this._player.position );


	//
	// with items
	//
	var removeItemList = [];
	for (var i = this._items.length - 1; i >= 0; i--) {
		var item = this._items[i];
		var boundingBox = item.geometry.boundingBox.clone();
		boundingBox.translate( item.position );
		if( playerBoundingBox.isIntersectionBox( boundingBox ) ) {
			this._effect.showEffect('coin', 800);
			item.OnCollide( item );
			removeItemList.push( item );
		}
	};

	for (var i = removeItemList.length - 1; i >= 0; i--) {
		var obj = removeItemList[i];
		var index = this._items.indexOf( obj );
		this._items.splice( index, 1 );
		this._root.remove( obj );
		this._objectPool.PayBackCoin( obj );
	};


	//
	// with enemies
	//
	for (var i = this._enemies.length - 1; i >= 0; i--) {
		var enemy = this._enemies[i];
		var boundingBox = enemy.geometry.boundingBox.clone();
		boundingBox.translate( enemy.position );
		if( playerBoundingBox.isIntersectionBox( boundingBox ) ) {
			this.GameOver();
			return;
		}
	};

	for (var i = this._enemies.length - 1; i >= 0; i--) {
		var enemy = this._enemies[i];
		if( enemy._type === 2 && ! enemy._bursted ) {
			if( enemy.position.z - this._player.position.z < 65 ) {
				enemy.Burst( enemy );
			}
		}
	};
}

StateGame.prototype.RemoveFarClimate = function () {
	var removeList = [];

	var pz = this._player.position.z;
	for (var i = this._climates.length - 1; i >= 0; i--) {
		var climate = this._climates[i];
		var ez = climate.position.z;
		if( pz - ez > 100 ) {
			removeList.push( climate );
		}else{
			climate.position.z -= this._player._speed / 80;
		}
	};

	for (var i = removeList.length - 1; i >= 0; i--) {
		var obj = removeList[i];
		var index = this._climates.indexOf( obj );
		this._climates.splice( index, 1 );
		this._root.remove( obj );
		this._objectPool.PayBackClimate( obj );
	};
}

StateGame.prototype.GameOver = function () {
	// stateManager.SetState("StateFirst");
	this._effect.showEffect('hit', 500);
	this._effect.shakeCamera(250);
	console.log( 'game over' );
}




function StateManager() {
	var _curr = undefined;
}

StateManager.prototype = {
	SetState: function (state) {
		if( this._curr === undefined ) {
			var inst = this.InstantiateState(state);
			inst.OnEnter();

			this._curr = inst;
			return;
		}

		if( this._curr.stateName === state ) {
			return;
		}

		this._curr.OnExit();

		var inst = this.InstantiateState(state);
		inst.OnEnter();

		this._curr = inst;
	},

	InstantiateState: function (stateName) {
		var state;
		if( stateName === "StateFirst" ) {
			state = new StateFirst();
		}
		else if( stateName === "StateGame" ) {
			state = new StateGame();
		}

		return state;
	},

	Update: function (dt) {
		this._curr.Update( dt );
	}
};


var scene, camera, clock, renderer;
var stereoEffect, CardBoardSystemOn = true;

function Init () {
	scene = new THREE.Scene();
	camera = new THREE.PerspectiveCamera(
		75, 
		window.innerWidth / window.innerHeight, 
		0.1, 
		1000);
	camera.position.set( 15, 15, 15 );
	camera.lookAt( scene.position );

	renderer = new THREE.WebGLRenderer({ antialiasing: true });
	renderer.setClearColor( 0x000000, 1.0 ); // the default
	renderer.setSize(window.innerWidth - 10, window.innerHeight);
	document.body.appendChild(renderer.domElement);

	effect = new THREE.StereoEffect(renderer);
	effect.separation = 0.2;
	effect.targetDistance = 50;
	effect.setSize( window.innerWidth, window.innerHeight );


	scene.add( new THREE.AmbientLight( 0x222222 ) );

	clock = new THREE.Clock();

	enterFullscreen();
}

console.log( window.innerWidth + " " + window.innerHeight );

CreateAxis = function (scene) {
	scene.add( new THREE.AxisHelper(1000) );
}

ProcessKeyInput = function (keyboard) {
	if( keyboard.pressed("1") ) {
		stateManager.SetState("StateFirst");
	}
	else if( keyboard.pressed("2") ) {
		stateManager.SetState("StateGame");
	}
}

function onFullScreenEnter() {
	elem.onwebkitfullscreenchange = onFullScreenExit;
	elem.onmozfullscreenchange = onFullScreenExit;
};

function enterFullscreen() {
	var elem = document.body;
	elem.onwebkitfullscreenchange = onFullScreenEnter;
	elem.onmozfullscreenchange = onFullScreenEnter;
	elem.onfullscreenchange = onFullScreenEnter;
	if (elem.webkitRequestFullscreen) {
		elem.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
	} 
	else {
		if (elem.mozRequestFullScreen) {
			elem.mozRequestFullScreen();
		} else {
			elem.requestFullscreen();
		}
	}
}


Init();
// CreateAxis(scene);

var keyboard = new THREEx.KeyboardState();
var stateManager = new StateManager();
stateManager.SetState("StateFirst");

var render = function () {
	requestAnimationFrame(render);

	ProcessKeyInput(keyboard);

	var dt = clock.getDelta();
	stateManager.Update( dt );

	if( CardBoardSystemOn ) {
		effect.render( scene, camera );
	}
	else {
		renderer.render(scene, camera);
	}
};

render();