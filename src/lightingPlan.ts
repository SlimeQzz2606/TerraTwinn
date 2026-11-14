export interface LightingWindow {
  start_utc:string;end_utc:string;best_utc:string;start_local:string;end_local:string;best_local:string;timezone:string;
  duration_minutes:number;elevation_deg:number;azimuth_deg:number;elevation_error_deg:number;azimuth_error_deg:number;
}
export interface LightingSchedule { matching_windows:number;windows:LightingWindow[] }
export interface LightingPlan {
  target:{time_utc:string;elevation_deg:number;azimuth_deg:number;auto_selected:boolean;method:string};
  search_start:string;search_days:number;elevation_tolerance_deg:number;azimuth_tolerance_deg:number;
  pool_size:number;selection_rule:string;limitations:string;
}
export const lightingDate=(value:string)=>value.slice(0,16).replace('T',' ')
