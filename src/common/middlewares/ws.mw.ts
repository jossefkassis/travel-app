import { Socket } from "socket.io";
import { WsJwtGuard } from "../guards/ws-jwt.guard";

export type SocketMiddleWare ={
    (client:Socket,next:(err?:Error)=>void);
}

export const SocketMiddleWare = ():SocketMiddleWare =>{
    return(client,next)=>{
        try {
            next()
        } catch (error) {
            next(error)
        }
    }
}