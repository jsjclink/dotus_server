const express = require("express")
const app = express()
const server = require('http').createServer(app)
const io = require('socket.io')(server)
const mysql = require('mysql2/promise')
const mysql_old = require('mysql2')

server.listen(443);

const paint_namespace = io.of('/paint')

{
  let socketId_roomName_map = {}      //{socket.id : room_name, ...}
  let current_room_info_list = {}   //{room_name : {bitmap_array : bitmap_array, width : width, height : height}, ...}

  //함수 선언
  const doJoin_paint = async (socket, room_name) => {
    socketId_roomName_map[socket.id] = room_name
    socket.join(`${room_name}`)

    if(current_room_info_list[room_name] == undefined){
      try{
        const connection = await mysql.createConnection({
          host  : 'localhost',
          user  : 'jsjclink',
          password : '!#jsj09822',
          database : 'testdb2'
        })
        
        const [results, fields] = await connection.query(`select * from user_img_table where user_id = '${room_name}'`)
        const bitmap_arr = results[0].user_img.substring(1, results[0].user_img.length-1).split(',').map((item) => {
          return parseInt(item, 10)
        })
        const width = results[0].width
        const height = results[0].height
  
        current_room_info_list[room_name] =  {"bitmap_arr" : bitmap_arr.slice(), "width" : width, "height" : height}
  
        paint_namespace.to(`${room_name}`).emit('img_ret', results[0].user_img, width, height)
      }
      catch(error){
        console.log(`error in doJoin_paint : ${error}`)
      }
    }
    else{
      let current_room_info = current_room_info_list[room_name]
      paint_namespace.to(`${room_name}`).emit('img_ret', `[${current_room_info.bitmap_arr}]`, current_room_info.width, current_room_info.height)
    }
  }

  const doImgChange_paint = (socket, args) => {
    const index = args[0], color = args[1]
    const room_name = socketId_roomName_map[socket.id]

    current_room_info_list[room_name].bitmap_arr[index] = color

    paint_namespace.to(`${room_name}`).emit('change_dot', index, color)
  }

  const doDisconnect_paint = async (socket) => {
    const room_name = socketId_roomName_map[socket.id]
    
    delete socketId_roomName_map[socket.id]

    if(Object.values(socketId_roomName_map).includes(room_name) == false){
      console.log("no user in this room")

      try{
        const connection = await mysql.createConnection({
          host  : 'localhost',
          user  : 'jsjclink',
          password : '!#jsj09822',
          database : 'testdb2'
        })

        const bitmap_arr = current_room_info_list[room_name].bitmap_arr
  
        const [results, fields] = await connection.query(`update user_img_table set user_img = '[${bitmap_arr}]' where user_id = '${room_name}'`)
      }
      catch(error){
        console.log(`error in doDisconnect_paint : ${error}`)
      }
    }
  }

  //main
  paint_namespace.on("connection", (socket) => {
    console.log("paint connected")

    socket.on("join", (...args) => {
      console.log(`socket.on "join" called by socket.id : ${socket.id}"`)
      doJoin_paint(socket, args[0])
    })
  
    socket.on("imgChange", (...args) => {
      console.log(`socket.on "imgChange" called by socket.id : ${socket.id}"`)
      doImgChange_paint(socket, args)
    })
  
    socket.on("disconnect", () =>{
      console.log(`socket.on "disconnect" called by socket.id : ${socket.id}"`)
      doDisconnect_paint(socket)
    })
  })
}

const global_namespace = io.of('/global')

{
  let global_bitmap_arr
  let global_width
  let global_height

  //함수 선언
  const runGlobal = async () => {
    let connection
    try{
      //init
      connection = await mysql.createConnection({
        host  : 'localhost',
        user  : 'jsjclink',
        password : '!#jsj09822',
        database : 'testdb2'
      })
      
      const [results, fields] = await connection.query(`select * from user_img_table where user_id = "global"`)
      const bitmap_arr = results[0].user_img.substring(1, results[0].user_img.length-1).split(',').map((item) => {
        return parseInt(item, 10)
      })
      global_width = results[0].width
      global_height = results[0].height

      global_bitmap_arr = bitmap_arr.slice()

      updateEvery60_global()
      
      //
      global_namespace.on("connection", (socket) => {
        console.log("global connected")
        global_namespace.emit('img_ret', `[${global_bitmap_arr}]`, global_width, global_height)
        
        socket.on("imgChange", (...args) => {
          doImgChange_global(args)
        })
      })
    }
    catch(error){
      console.log(`error in runGlobal : ${error}`)
    }
  } 

  const updateEvery60_global = () => {
    setInterval(function(){
      const connection = mysql_old.createConnection({
        host  : 'localhost',
        user  : 'jsjclink',
        password : '!#jsj09822',
        database : 'testdb2'
      })
    
      connection.connect()
    
      connection.query(`update user_img_table set user_img = '[${global_bitmap_arr}}]' where user_id = 'global'`, function (error, results) {
        connection.end()
        if(error){
          console.log(`sql_query fail in doDisconnect_global : ${error}`)
        }
        else{
          console.log("change success on global!")
        }
      })
    }, 1000 * 60)
  }

  const doImgChange_global = (args) => {
    const index = args[0], color = args[1]
    global_bitmap_arr[index] = color

    console.log("doImgChange_global called")

    global_namespace.emit('change_dot', index, color, global_width, global_height)
  }

  //main
  runGlobal()
}

const roomInfo_namespace = io.of('/roomInfo')
let room_info_list = {} // insideRoom_namespace에서 수정하기 떄문에 global

{
  //함수 선언
  const doMakeRoom_roomInfo = (socket, args) => {
    const room_name = args[0]
    const pwd = args[1]
    if(room_info_list[room_name] == undefined){
      room_info_list[room_name] = {"pwd" : pwd}
      roomInfo_namespace.to(`${socket.id}`).emit("makeRoom_res", "success", room_name)
      console.log("create room")
      console.log(room_info_list)
    }
    else{
      roomInfo_namespace.to(`${socket.id}`).emit("makeRoom_res", "failure")
      console.log("room name already exists")
    }
  }

  //main
  roomInfo_namespace.on("connection", (socket) => {
    console.log("roomInfo connected")

    roomInfo_namespace.emit("user_room_list", Object.keys(room_info_list))

    socket.on("makeRoom", (...args) => {
      doMakeRoom_roomInfo(socket, args)
    })
  })
}

const insideRoom_namespace = io.of('/insideRoom')

{
  let socketId_roomName_map = {}    //{socket.id : room_name, ...}
  let current_room_info_list = {}   //{room_name : {bitmap_arr : bitmap_arr, width: width, height: height, user_list : [socket.id, ...]}, ...}

  //함수 선언
  const doInitRoom_insideRoom = (socket, args) => {
    const room_name = args[0]
    const width = args[1]
    const height = args[2]
    console.log(`openroom : ${room_name}`)

    socketId_roomName_map[socket.id] = room_name
    current_room_info_list[room_name] = {"bitmap_arr" : Array.from({length: width*height}, () => 0), "width" : width, "height" : height, "user_list" : [socket.id]}
    socket.join(room_name)

    const bitmap_arr = current_room_info_list[room_name].bitmap_arr
    insideRoom_namespace.to(`${room_name}`).emit('img_ret', `[${bitmap_arr}]`, width, height)
    console.log(`initRoom : ${current_room_info_list}`)
  }

  const doJoinRoom_insideRoom = (socket, args) => {
    const room_name = args[0]
    console.log(`joinRoom : ${args[0]}`)

    socketId_roomName_map[socket.id] = room_name
    current_room_info_list[room_name].user_list.push(socket.id)
    socket.join(room_name)

    const bitmap_arr = current_room_info_list[room_name].bitmap_arr
    const width = current_room_info_list[room_name].width
    const height = current_room_info_list[room_name].height

    insideRoom_namespace.to(`${room_name}`).emit('img_ret', `[${bitmap_arr}]`, width, height)
  }

  const doImgChange_insideRoom = (socket, args) => {
    try{
      const room_name = socketId_roomName_map[socket.id]
      const index = args[0], color = args[1]

      current_room_info_list[room_name].bitmap_arr[index] = color

      insideRoom_namespace.to(`${room_name}`).emit('change_dot', index, color)
    }
    catch(try_error){
      console.log(`error in doImgChange_insideRoom : ${try_error}`)
    }
  }

  const doDisconnect_insideRoom = (socket, args) => {
    try{
      const room_name = socketId_roomName_map[socket.id]
      if(socketId_roomName_map[socket.id] != undefined){
        delete socketId_roomName_map[socket.id]

        if(current_room_info_list[room_name] != undefined){
          const idx = current_room_info_list[room_name].user_list.indexOf(socket.id)
          if(idx != -1){
            current_room_info_list[room_name].user_list.splice(idx)
          }

          if(current_room_info_list[room_name].user_list.length == 0){
            console.log("delete_room")
            delete current_room_info_list[room_name]
            delete room_info_list[room_name]
          }
        }
      }
    }
    catch(try_error){
      console.log(`error in doDisconnect_insideRoom : ${try_error}`)
    }
  }

  //main
  insideRoom_namespace.on("connection", (socket) => {
    console.log("insideRoom connected")

    socket.on("initRoom", (...args) => {
      doInitRoom_insideRoom(socket, args)
    })

    socket.on("joinRoom", (...args) => {
      doJoinRoom_insideRoom(socket, args)
    })

    socket.on("imgChange", (...args) => {
      doImgChange_insideRoom(socket, args)
    })

    socket.on("disconnect", (...args) => {
      doDisconnect_insideRoom(socket, args)
    })
  })
}

const account_namespace = io.of('/account')

{
  const doExistUserKakaoNum_account = async (socket, args) => {
    try{
      const connection = await mysql.createConnection({
        host  : 'localhost',
        user  : 'jjungnii',
        password : 'qpalzm7523138',
        database : 'DotUsDB'
      })
  
      const [results, fields] = await connection.query(`select EXISTS(select * from user_list where kakao_num=${args[0]} limit 1) as success`)
      
      account_namespace.to(socket.id).emit("exist_user_kakaonum", results[0].success)
    }
    catch(error){
      console.log(`error in account : ${error}`)
    }
  }

  const doAddUser_account = async (socket, args) => {
    try{
      const connection = await mysql.createConnection({
        host  : 'localhost',
        user  : 'jjungnii',
        password : 'qpalzm7523138',
        database : 'DotUsDB'
      })
  
      const [results, fields] = await connection.query(`insert into user_list(nickname, kakao_num, id, img, friend_list) values ('${args[0]}','${args[1]}','${args[2]}','${args[3]}','${JSON.stringify(args[4])}')`)
    }
    catch(error){
      console.log(`error in account : ${error}`)
    }    
  }

  const doVerifyFriend_account = async (socket, args) => {
    try{
      const connection = await mysql.createConnection({
        host  : 'localhost',
        user  : 'jjungnii',
        password : 'qpalzm7523138',
        database : 'DotUsDB'
      })

      const [results, fields] = await connection.query(`select EXISTS(select * from user_list where id='${args[0]}' limit 1) as success`)
      if(results[0].success == 0){
        account_namespace.to(socket.id).emit("verify_friend", "invalid_id")
      }
      else{
        try{          
          const [results1, fields1] = await connection.query(`select friend_list from user_list where id = '${args[1]}'`)
          
          if(results1[0].friend_list.indexOf(args[0]) != -1){
            account_namespace.to(socket.id).emit("verify_friend", "already added")
          }
          else{
            account_namespace.to(socket.id).emit("verify_friend", "add friend success")
          }
        }
        catch(error1){
          console.log(`error in doVerifyFriend_account1 : ${error1}`)
        }
      }
    }
    catch(error){
      console.log(`error in doVerifyFriend_account : ${error}`)
    }
  }

  const doAddFriend_account = async (socket, args) => {
    try{
      const connection = await mysql.createConnection({
        host  : 'localhost',
        user  : 'jjungnii',
        password : 'qpalzm7523138',
        database : 'DotUsDB'
      })

      const [results, fields] = await connection.query(`update user_list set friend_list=JSON_ARRAY_APPEND(friend_list, '$', '${args[0]}') where id='${args[1]}'`)
    }
    catch(error){
      console.log(`error in doAddFriend_account : ${error}`)
    }
  }

  const doGetFriendList_account = async (socket, args) => {
    try{
      const connection = await mysql.createConnection({
        host  : 'localhost',
        user  : 'jjungnii',
        password : 'qpalzm7523138',
        database : 'DotUsDB'
      })

      let [results, fields] = await connection.query(`select friend_list from user_list where id = '${args[0]}'`)

      let str = results[0].friend_list.map(f => `id = "${f}"`).join(" or ")
      try{
        if(results[0].friend_list.length != 0) {
          let [results, fields] = await connection.query(`select nickname, id, img from user_list where ${str}`)
          account_namespace.to(socket.id).emit("get_friend_info",results)
        }
      } catch(error1){
        console.log(error1)
      }
    } catch (error){
      console.log(error)
    }
  }

  const doPutData_account = async (socket, args) => {
    console.log("called doPutData_account")
    const num_str = args[0]
    const user_id = args[1]
    const width = args[2]
    const height = args[3]
    console.log(width)

    try{
      const connection = await mysql.createConnection({
        host  : 'localhost',
        user  : 'jsjclink',
        password : '!#jsj09822',
        database : 'testdb2'
      })
  
      const [results, fields] = await connection.query(`insert into user_img_table(user_id, user_img, width, height) values ("${user_id}", "${num_str}", ${width}, ${height})`)
    }
    catch(error){
      console.log(`error in doPutData_account : ${error}`)
    }
  }

  account_namespace.on("connection", (socket) => {
    console.log("account connected")

    socket.on("existUserKakaoNum", (...args) => {
      doExistUserKakaoNum_account(socket, args)
    })
    socket.on("addUser", (...args) => {
      doAddUser_account(socket, args)
    })
    socket.on("verifyFriend", (...args) => {
      doVerifyFriend_account(socket, args)
    })
    socket.on("addFriend", (...args) => {
      doAddFriend_account(socket, args)
    })
    socket.on("getFriendList", (...args) => {
      doGetFriendList_account(socket, args)
    })
    socket.on("putData", (...args) => {
      console.log("putData called")
      doPutData_account(socket, args)
    })
  })

}