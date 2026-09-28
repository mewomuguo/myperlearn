import {createContext,useContext} from 'react';
import type {Content,StudyState} from './types';
export type StudyContext={c:Content;s:StudyState;commit:(f:(s:StudyState)=>StudyState)=>Promise<void>;toast:(message:string)=>void};
export const Study=createContext<StudyContext>(null!);
export const useStudy=()=>useContext(Study);
