import { ArrowUpRight, CornerDownRight } from 'lucide-react';
import { Link } from 'react-router-dom';
export function Prerequisite({title,description,to,action}:{title:string;description:string;to:string;action:string}){
 return <section className="prerequisite-note"><span className="task-icon"><CornerDownRight size={23}/></span><div><span className="desk-eyebrow">A USEFUL NEXT STEP</span><h3>{title}</h3><p>{description}</p><Link className="desk-link" to={to}>{action}<ArrowUpRight size={15}/></Link></div></section>;
}
