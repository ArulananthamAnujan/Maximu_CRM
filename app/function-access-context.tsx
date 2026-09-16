"use client";
import {createContext,useContext} from "react";
import {canUse,type AccessIdentity} from "@/lib/function-access";
export const FunctionAccessContext=createContext<AccessIdentity|null>(null);
export function useFunctionAccess(){const identity=useContext(FunctionAccessContext);return (key:string)=>canUse(identity,key);}
