"use client";
import {createContext,useContext} from "react";
import {canUse,canEdit,type AccessIdentity} from "@/lib/function-access";
export const FunctionAccessContext=createContext<AccessIdentity|null>(null);
export function useFunctionAccess(){const identity=useContext(FunctionAccessContext);return (key:string)=>canUse(identity,key);}
/** Whether the signed-in account may change records in a section, not only read them. */
export function useFunctionEdit(){const identity=useContext(FunctionAccessContext);return (key:string)=>canEdit(identity,key);}
