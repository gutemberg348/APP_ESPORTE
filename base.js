import React, { useState, useEffect } from 'react';
import { 
  Home, 
  CreditCard, 
  Gamepad2, 
  Tags, 
  User, 
  Bell, 
  QrCode, 
  ChevronRight, 
  ChevronDown,
  Trophy, 
  ShoppingBag, 
  Tv, 
  TrendingUp, 
  MapPin, 
  Calendar,
  Percent,
  Shield,
  Star,
  RefreshCw,
  LogOut,
  HelpCircle,
  History,
  Ticket,
  Store,
  UserPlus,
  X,
  Zap,
  Sun,
  Moon
} from 'lucide-react';

const userData = {
  name: "Rafael Silva",
  plan: "Sócio Canário Ouro",
  memberId: "1092.4882.1102",
  points: 12450,
  avatar: "https://i.pravatar.cc/150?u=rafael",
  status: "ATIVO"
};

const nextMatch = {
  homeTeam: "NACIONAL",
  awayTeam: "TREZE-PB",
  date: "Sáb, 24 Out - 16:00",
  stadium: "Est. José Cavalcanti",
  competition: "Campeonato Paraibano",
  isHome: true
};

const partners = [
  { id: 1, name: "Supermercado Guedes", discount: "15%", category: "Alimentação" },
  { id: 2, name: "Farmácias Pague Menos", discount: "20%", category: "Saúde" },
  { id: 3, name: "Posto Paizão", discount: "R$0,20/L", category: "Combustível" },
  { id: 4, name: "Boby Lanches", discount: "10% OFF", category: "Restaurante" },
  { id: 5, name: "Academia Fitness", discount: "Isenção na Matrícula", category: "Saúde" },
  { id: 6, name: "Barbearia do Zé", discount: "15% OFF", category: "Beleza" }
];

const EscudoNacional = ({ className }) => (
  <svg viewBox="0 0 200 220" className={`${className} drop-shadow-md`} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M100 215C100 215 15 170 15 80V30L100 10L185 30V80C185 170 100 215 100 215Z" fill="#fff" stroke="#166534" strokeWidth="8"/>
    <circle cx="100" cy="110" r="60" fill="none" stroke="#166534" strokeWidth="6"/>
    <circle cx="100" cy="110" r="50" fill="none" stroke="#166534" strokeWidth="4"/>
    <text x="100" y="115" fontFamily="Arial, sans-serif" fontSize="48" fontWeight="900" fill="#166534" textAnchor="middle" alignmentBaseline="middle">NAC</text>
    <path d="M70 150 Q100 135 130 150" fill="none" stroke="#166534" strokeWidth="4"/>
    <polygon points="65,15 75,35 95,35 80,50 85,70 65,55 45,70 50,50 35,35 55,35" fill="#FBBF24"/>
    <polygon points="135,15 145,35 165,35 150,50 155,70 135,55 115,70 120,50 105,35 125,35" fill="#9CA3AF"/>
  </svg>
);

const HomeTab = ({ onOpenTicket, onOpenStadiumMode, isDark, hasTicket }) => (
  <div className="space-y-6 pb-24 animate-in fade-in duration-500">
    
    <div className="relative rounded-3xl p-[1px] bg-gradient-to-b from-green-400/30 to-transparent overflow-hidden shadow-lg">
      <div className={`absolute inset-0 bg-gradient-to-br ${isDark ? 'from-emerald-900/90 to-black/90' : 'from-emerald-800 to-green-950'} backdrop-blur-xl z-0`}></div>
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-green-500/20 blur-3xl rounded-full z-0"></div>

      <div className="relative z-10 p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
            <span className="text-[10px] font-bold text-green-400 tracking-widest uppercase">{nextMatch.competition}</span>
          </div>
          <span className="text-[11px] text-gray-200 flex items-center gap-1.5 font-medium">
            <Calendar size={14} className="text-green-400"/> {nextMatch.date}
          </span>
        </div>
        
        <div className="flex justify-between items-center mb-8 px-2">
          <div className="flex flex-col items-center gap-3 w-1/3">
            <div className="w-16 h-16 relative">
              <div className="absolute inset-0 bg-white/20 blur-md rounded-full"></div>
              <EscudoNacional className="w-full h-full relative z-10" />
            </div>
            <span className="text-sm font-bold text-white tracking-tight">{nextMatch.homeTeam}</span>
          </div>
          
          <div className="flex flex-col items-center justify-center w-1/3">
            <span className="text-xs font-black italic text-gray-400 mb-1">VS</span>
            <div className="h-px w-12 bg-gradient-to-r from-transparent via-gray-400 to-transparent"></div>
          </div>
          
          <div className="flex flex-col items-center gap-3 w-1/3">
            <div className="w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-sm">
               <Shield className="text-white" size={24} strokeWidth={1.5} />
            </div>
            <span className="text-sm font-bold text-gray-100 tracking-tight">{nextMatch.awayTeam}</span>
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center text-xs text-gray-300 font-medium gap-1.5">
            <MapPin size={14} className="text-green-400" /> {nextMatch.stadium}
          </div>
          {hasTicket ? (
            <button 
              onClick={onOpenStadiumMode}
              className="px-4 py-2.5 bg-white text-emerald-700 text-[11px] font-black rounded-full shadow-[0_0_20px_rgba(255,255,255,0.4)] flex items-center gap-1.5 hover:scale-105 transition-transform animate-pulse"
            >
              <Zap size={14} className="fill-emerald-600" /> Ativar Luzes
            </button>
          ) : (
            <button 
              onClick={onOpenTicket}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white text-xs font-bold rounded-full shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:scale-105 transition-transform"
            >
              Comprar VIP
            </button>
          )}
        </div>
      </div>
    </div>

    <div>
      <h3 className={`text-xs font-bold uppercase tracking-widest mb-4 px-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Acesso Rápido</h3>
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: Ticket, label: "Ingressos", color: "from-blue-500/20 to-blue-500/5", iconColor: "text-blue-500" },
          { icon: ShoppingBag, label: "Boutique", color: "from-emerald-500/20 to-emerald-500/5", iconColor: "text-emerald-500" },
          { icon: Tv, label: "Naça TV", color: "from-purple-500/20 to-purple-500/5", iconColor: "text-purple-500" },
          { icon: Trophy, label: "História", color: "from-yellow-500/20 to-yellow-500/5", iconColor: "text-yellow-500" }
        ].map((action, i) => (
          <div key={i} className="flex flex-col items-center gap-2 cursor-pointer group">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-b ${action.color} border flex items-center justify-center group-hover:scale-105 transition-all duration-300 ${isDark ? 'border-white/5 shadow-black/20' : 'border-gray-100 bg-white shadow-sm'}`}>
              <action.icon className={`${action.iconColor} drop-shadow-sm`} size={24} strokeWidth={1.5} />
            </div>
            <span className={`text-[10px] font-medium transition-colors ${isDark ? 'text-gray-400 group-hover:text-white' : 'text-gray-600 group-hover:text-emerald-600'}`}>{action.label}</span>
          </div>
        ))}
      </div>
    </div>

    <div className={`rounded-2xl border overflow-hidden cursor-pointer group relative shadow-sm ${isDark ? 'border-white/5' : 'border-gray-100 bg-white'}`}>
      <div className={`absolute inset-0 bg-gradient-to-r z-0 transition-colors ${isDark ? 'from-green-900/40 to-black/20 group-hover:from-green-800/50' : 'from-green-50 to-transparent group-hover:from-green-100'}`}></div>
      <div className="relative z-10 p-5 flex gap-4 items-center">
        <div className={`w-16 h-16 rounded-xl flex items-center justify-center relative overflow-hidden flex-shrink-0 backdrop-blur-sm ${isDark ? 'bg-black/50 border-white/10' : 'bg-white shadow-md border-gray-100'}`}>
          <Tv className={isDark ? "text-gray-300" : "text-gray-700"} size={24} strokeWidth={1.5} />
          <div className="absolute top-1 left-1 bg-red-500 w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
        </div>
        <div className="flex-1">
          <span className="text-[10px] font-bold text-red-500 tracking-widest uppercase mb-1 block">Ao Vivo</span>
          <h4 className={`text-sm font-semibold leading-snug ${isDark ? 'text-white' : 'text-gray-800'}`}>
            Acompanhe o treino tático direto do Ninho do Canário
          </h4>
        </div>
        <ChevronRight size={20} className={`transition-colors ${isDark ? 'text-gray-600 group-hover:text-green-400' : 'text-gray-400 group-hover:text-green-600'}`} />
      </div>
    </div>
  </div>
);

const CardTab = () => {
  const [timer, setTimer] = useState(30);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev === 1 ? 30 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full pb-24 animate-in slide-in-from-bottom-4 duration-500">
      <div className="w-full aspect-[5/8] max-h-[540px] rounded-[2rem] p-[1px] bg-gradient-to-br from-yellow-400/50 via-green-600/30 to-black/50 relative shadow-[0_20px_50px_rgba(2,44,34,0.5)]">
        
        <div className="w-full h-full bg-gradient-to-br from-emerald-950 to-black rounded-[2rem] p-7 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay pointer-events-none"></div>
          <div className="absolute -right-20 -top-20 opacity-10 transform scale-150 pointer-events-none grayscale">
            <EscudoNacional className="w-64 h-64" />
          </div>
          <div className="absolute top-0 left-[-100%] w-[200%] h-full bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 animate-[shine_6s_infinite]"></div>

          <div className="flex justify-between items-start relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <EscudoNacional className="w-8 h-8" />
                <h2 className="text-lg font-black tracking-widest text-white">NACIONAL</h2>
              </div>
              <div className="flex items-center gap-1.5 bg-yellow-400/10 px-2 py-0.5 rounded border border-yellow-400/20 inline-flex">
                 <Star size={10} className="text-yellow-400" fill="currentColor" />
                 <span className="text-[9px] text-yellow-400 font-bold uppercase tracking-wider">{userData.plan}</span>
              </div>
            </div>
            
            <div className="bg-emerald-500/10 px-3 py-1.5 rounded-full flex items-center gap-2 border border-emerald-500/30 backdrop-blur-md shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
              <span className="text-[10px] font-bold text-emerald-300 tracking-widest">ATIVO</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center z-10 w-full mt-4">
            <div className="bg-white p-5 rounded-2xl relative overflow-hidden shadow-2xl">
              <QrCode size={160} className="text-black" strokeWidth={1.2} />
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-80 animate-[scan_2.5s_ease-in-out_infinite] shadow-[0_0_10px_#10b981]"></div>
            </div>
            
            <div className="mt-6 flex items-center gap-2 text-[11px] font-medium px-4 py-1.5 bg-black/40 rounded-full border border-white/5 backdrop-blur-sm">
              <RefreshCw size={12} className={`text-emerald-400 ${timer <= 5 ? "animate-spin" : ""}`} />
              <span className="text-gray-300">
                Token dinâmico: <span className={timer <= 5 ? "text-red-400 font-bold" : "text-white font-bold"}>00:{timer.toString().padStart(2, '0')}</span>
              </span>
            </div>
          </div>

          <div className="relative z-10 mt-4">
            <div className="mb-4">
              <div className="text-[9px] text-gray-400 uppercase tracking-widest mb-0.5">Sócio Titular</div>
              <div className="font-bold text-xl text-white tracking-tight">{userData.name}</div>
            </div>
            
            <div className="flex justify-between items-end">
              <div>
                <div className="text-[9px] text-gray-400 uppercase tracking-widest mb-0.5">Matrícula</div>
                <div className="font-mono text-sm text-gray-200 tracking-wider">{userData.memberId}</div>
              </div>
              <div className="text-right">
                <div className="text-[9px] text-gray-400 uppercase tracking-widest mb-0.5">Validade</div>
                <div className="font-mono text-sm text-gray-200 tracking-wider">12/26</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan {
          0% { transform: translateY(-10px); }
          50% { transform: translateY(190px); }
          100% { transform: translateY(-10px); }
        }
        @keyframes shine {
          0% { transform: translateX(-100%) skewX(12deg); }
          20% { transform: translateX(100%) skewX(12deg); }
          100% { transform: translateX(100%) skewX(12deg); }
        }
      `}} />
    </div>
  );
};

const BenefitsTab = ({ isDark }) => {
  const [visiblePartners, setVisiblePartners] = useState(3);

  return (
    <div className="space-y-6 pb-28 animate-in fade-in duration-300">
      <div className="pt-2">
        <h2 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Clube de Vantagens</h2>
        <p className={`text-sm font-light mb-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Descontos reais na cidade para o Sócio Canário.</p>
        
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {["Todos", "Alimentação", "Saúde", "Combustível"].map((cat, i) => (
            <button key={i} className={`whitespace-nowrap px-5 py-2 rounded-full text-xs font-semibold transition-all ${
              i === 0 
                ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-900/50' 
                : isDark 
                  ? 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/5' 
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {partners.slice(0, visiblePartners).map(partner => (
          <div key={partner.id} className={`relative rounded-2xl p-[1px] group cursor-pointer overflow-hidden ${isDark ? 'bg-gradient-to-b from-white/10 to-transparent' : 'bg-white border border-gray-100 shadow-sm'}`}>
            <div className={`absolute inset-0 z-0 transition-colors ${isDark ? 'bg-black/40 backdrop-blur-sm group-hover:bg-black/20' : 'group-hover:bg-gray-50'}`}></div>
            <div className="relative z-10 p-4 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner ${isDark ? 'bg-gradient-to-br from-emerald-900 to-black border border-emerald-500/30' : 'bg-emerald-50 border border-emerald-100'}`}>
                <Percent className="text-emerald-500" size={20} strokeWidth={2} />
              </div>
              <div className="flex-1">
                <span className={`text-[9px] uppercase font-bold tracking-wider block mb-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{partner.category}</span>
                <h3 className={`font-semibold text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{partner.name}</h3>
              </div>
              <div className="text-right">
                <span className={`block px-3 py-1 rounded-lg text-sm font-bold ${isDark ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>{partner.discount}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {visiblePartners < partners.length && (
        <button 
          onClick={() => setVisiblePartners(partners.length)}
          className={`w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold rounded-2xl transition-colors ${isDark ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20' : 'text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'}`}
        >
          Ver todos os {partners.length} parceiros <ChevronDown size={16} />
        </button>
      )}

      <div className={`pt-6 border-t ${isDark ? 'border-white/5' : 'border-gray-200'}`}>
        <h3 className={`text-sm font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>Expanda nosso Clube</h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          
          <div className={`rounded-2xl p-4 flex flex-col gap-3 cursor-pointer transition-colors backdrop-blur-sm ${isDark ? 'bg-gradient-to-br from-white/10 to-white/5 border border-white/10 hover:bg-white/10' : 'bg-white border border-gray-200 hover:bg-gray-50 shadow-sm'}`}>
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Store className="text-blue-500" size={20} />
            </div>
            <div>
              <h4 className={`text-sm font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Indicar Comércio</h4>
              <p className={`text-[10px] mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Quer desconto no seu lugar favorito?</p>
            </div>
          </div>

          <div className={`rounded-2xl p-4 flex flex-col gap-3 cursor-pointer transition-colors backdrop-blur-sm ${isDark ? 'bg-gradient-to-br from-white/10 to-white/5 border border-white/10 hover:bg-white/10' : 'bg-white border border-gray-200 hover:bg-gray-50 shadow-sm'}`}>
            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <UserPlus className="text-yellow-500" size={20} />
            </div>
            <div>
              <h4 className={`text-sm font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Indicar Amigo</h4>
              <p className={`text-[10px] mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Ganhe +500 Zezitos por sócio.</p>
            </div>
          </div>

        </div>

        <div className={`rounded-2xl p-5 flex items-center justify-between backdrop-blur-md cursor-pointer hover:scale-[1.02] transition-transform ${isDark ? 'bg-gradient-to-r from-emerald-900/40 to-green-900/40 border border-emerald-500/20' : 'bg-gradient-to-r from-emerald-50 to-green-100 border border-emerald-200 shadow-sm'}`}>
          <div>
            <span className={`text-[10px] uppercase font-bold tracking-wider block mb-1 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>Para Lojistas da Região</span>
            <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-emerald-900'}`}>Seja um Parceiro Oficial</h4>
            <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-emerald-700/70'}`}>Aumente suas vendas com o Verdão</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.5)] flex-shrink-0">
            <ChevronRight className="text-white" size={20} />
          </div>
        </div>
      </div>
    </div>
  );
};

const ProfileTab = ({ isDark }) => (
  <div className="space-y-6 pb-24 animate-in fade-in duration-300">
    <div className="flex flex-col items-center justify-center pt-6 pb-4 relative">
      <div className="relative mb-4">
        <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-yellow-400 via-green-500 to-emerald-600">
          <div className="w-full h-full bg-black rounded-full overflow-hidden border-2 border-black">
            <img src={userData.avatar} alt="Avatar" className="w-full h-full object-cover" />
          </div>
        </div>
        <div className="absolute -bottom-2 -right-2 bg-gradient-to-r from-yellow-500 to-yellow-600 p-1.5 rounded-full border-2 border-black shadow-lg">
          <Star size={14} className="text-black" fill="currentColor" />
        </div>
      </div>
      
      <h2 className={`text-2xl font-bold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{userData.name}</h2>
      <span className="text-xs font-semibold text-yellow-500 tracking-widest uppercase">{userData.plan}</span>
    </div>

    <div className={`rounded-3xl p-5 flex items-center justify-between backdrop-blur-md ${isDark ? 'bg-gradient-to-br from-white/10 to-white/5 border border-white/10' : 'bg-white border border-gray-200 shadow-md'}`}>
      <div>
        <span className={`text-[10px] font-bold uppercase tracking-widest block mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Saldo de Moedas</span>
        <div className="flex items-center gap-2">
          <img src="https://cdn-icons-png.flaticon.com/512/5738/5738096.png" className="w-6 h-6 brightness-150 contrast-125 hue-rotate-30" alt="Coin" />
          <span className={`text-2xl font-black ${isDark ? 'text-white' : 'text-gray-900'}`}>{userData.points.toLocaleString('pt-BR')}</span>
        </div>
        <span className="text-[11px] text-emerald-500 font-medium mt-1 block">Você está no Top 5% de Sócios!</span>
      </div>
      <button className={`p-3 rounded-full transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
        <ChevronRight size={20} />
      </button>
    </div>

    <div className="space-y-2">
      {[
        { icon: User, label: "Meus Dados", desc: "Endereço, contatos e dependentes" },
        { icon: CreditCard, label: "Pagamentos", desc: "Cartões e histórico de faturas" },
        { icon: History, label: "Histórico de Jogos", desc: "Check-ins no José Cavalcanti" },
        { icon: HelpCircle, label: "Central de Ajuda", desc: "FAQ e suporte via WhatsApp" }
      ].map((item, i) => (
        <div key={i} className={`flex items-center gap-4 p-4 rounded-2xl transition-colors cursor-pointer group ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50 bg-white shadow-sm border border-gray-100'}`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/5 group-hover:bg-emerald-500/20' : 'bg-gray-50 group-hover:bg-emerald-50'}`}>
            <item.icon size={20} className={`transition-colors ${isDark ? 'text-gray-400 group-hover:text-emerald-400' : 'text-gray-500 group-hover:text-emerald-500'}`} />
          </div>
          <div className="flex-1">
            <h4 className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{item.label}</h4>
            <p className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{item.desc}</p>
          </div>
          <ChevronRight size={16} className={isDark ? "text-gray-600" : "text-gray-300"} />
        </div>
      ))}
    </div>

    <div className={`pt-4 border-t ${isDark ? 'border-white/5' : 'border-gray-200'}`}>
      <button className={`flex items-center gap-3 w-full p-4 rounded-2xl transition-colors ${isDark ? 'text-red-400 hover:bg-red-500/10' : 'text-red-500 hover:bg-red-50'}`}>
        <LogOut size={20} />
        <span className="text-sm font-semibold">Sair da Conta</span>
      </button>
    </div>
  </div>
);

const FanZoneTab = ({ onOpenStadiumMode, isDark }) => (
  <div className="space-y-6 pb-24 animate-in fade-in duration-300">
    <div className="pt-2">
      <h2 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Fan Zone</h2>
      <p className={`text-sm font-light mb-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Jogue, participe e acumule Moedas Zezito!</p>
    </div>

    <div 
      onClick={onOpenStadiumMode}
      className="relative rounded-3xl p-[1px] bg-gradient-to-r from-emerald-400 via-white to-emerald-400 overflow-hidden cursor-pointer group animate-pulse shadow-[0_0_30px_rgba(16,185,129,0.3)]"
    >
      <div className="bg-gradient-to-r from-emerald-900 to-black rounded-3xl p-5 relative overflow-hidden backdrop-blur-xl flex items-center justify-between">
        <div className="relative z-10 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={16} className="text-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-400 tracking-widest uppercase">Show da Torcida</span>
          </div>
          <h3 className="text-lg font-black text-white">Modo Estádio</h3>
          <p className="text-xs text-gray-300 mt-1">Transforme seu celular em um sinalizador luminoso sincronizado na arquibancada!</p>
        </div>
        <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
          <Zap size={24} className="text-emerald-400 fill-emerald-400" />
        </div>
      </div>
    </div>

    <div className={`rounded-3xl p-[1px] overflow-hidden ${isDark ? 'bg-gradient-to-b from-yellow-500/40 to-transparent' : 'bg-white shadow-xl border border-gray-100'}`}>
      <div className={`rounded-3xl p-6 relative overflow-hidden backdrop-blur-xl ${isDark ? 'bg-[#0a150f]' : 'bg-white'}`}>
        <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 blur-3xl rounded-full z-0 pointer-events-none"></div>
        
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <span className={`text-[10px] font-bold tracking-widest uppercase flex items-center gap-2 ${isDark ? 'text-yellow-400' : 'text-yellow-500'}`}>
              <Star size={12} fill="currentColor" /> Palpite Premiado
            </span>
            <span className="text-xs font-bold text-emerald-500">+500 Zezitos</span>
          </div>

          <p className={`text-sm text-center mb-6 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Qual será o placar do clássico?</p>

          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="flex flex-col items-center gap-2">
              <EscudoNacional className="w-12 h-12" />
              <input type="number" placeholder="0" className={`w-12 h-12 rounded-xl text-center text-xl font-black focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all ${isDark ? 'bg-black/50 border border-white/10 text-white' : 'bg-gray-50 border border-gray-200 text-gray-900'}`} />
            </div>
            
            <span className="text-gray-400 font-black italic">X</span>

            <div className="flex flex-col items-center gap-2">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDark ? 'bg-white/5 border border-white/10' : 'bg-gray-100 border border-gray-200'}`}>
                 <Shield className={isDark ? "text-gray-400" : "text-gray-500"} size={20} strokeWidth={1.5} />
              </div>
              <input type="number" placeholder="0" className={`w-12 h-12 rounded-xl text-center text-xl font-black focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all ${isDark ? 'bg-black/50 border border-white/10 text-white' : 'bg-gray-50 border border-gray-200 text-gray-900'}`} />
            </div>
          </div>

          <button className="w-full py-3 bg-gradient-to-r from-yellow-400 to-yellow-500 text-black text-sm font-black rounded-xl shadow-[0_0_15px_rgba(234,179,8,0.3)] hover:scale-[1.02] transition-transform">
            Confirmar Palpite
          </button>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div className={`rounded-2xl p-4 flex flex-col items-center text-center gap-2 cursor-pointer transition-colors ${isDark ? 'bg-white/5 border border-white/5 hover:bg-white/10' : 'bg-white border border-gray-100 shadow-sm hover:bg-gray-50'}`}>
        <Trophy size={24} className="text-emerald-500" />
        <div>
          <h4 className={`text-sm font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Quiz Histórico</h4>
          <p className={`text-[10px] mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Conhece o Verdão?</p>
        </div>
      </div>
      <div className={`rounded-2xl p-4 flex flex-col items-center text-center gap-2 cursor-pointer transition-colors ${isDark ? 'bg-white/5 border border-white/5 hover:bg-white/10' : 'bg-white border border-gray-100 shadow-sm hover:bg-gray-50'}`}>
        <TrendingUp size={24} className="text-blue-500" />
        <div>
          <h4 className={`text-sm font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Craque do Jogo</h4>
          <p className={`text-[10px] mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Vote agora</p>
        </div>
      </div>
    </div>
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showStadiumMode, setShowStadiumMode] = useState(false);
  const [stadiumColor, setStadiumColor] = useState('bg-emerald-500');
  const [isDark, setIsDark] = useState(true);
  const [hasTicket, setHasTicket] = useState(false);

  useEffect(() => {
    if (!showStadiumMode) return;
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {}
    };
    requestWakeLock();

    const interval = setInterval(() => {
      const timePhase = Math.floor(Date.now() / 800); 
      if (timePhase % 2 === 0) {
        setStadiumColor('bg-emerald-500');
      } else {
        setStadiumColor('bg-white');
      }
    }, 50); 

    return () => {
      clearInterval(interval);
      if (wakeLock !== null) {
        wakeLock.release();
      }
    };
  }, [showStadiumMode]);

  const renderTab = () => {
    switch(activeTab) {
      case 'home': return <HomeTab onOpenTicket={() => setShowTicketModal(true)} onOpenStadiumMode={() => setShowStadiumMode(true)} isDark={isDark} hasTicket={hasTicket} />;
      case 'card': return <CardTab />; 
      case 'benefits': return <BenefitsTab isDark={isDark} />;
      case 'fanzone': return <FanZoneTab onOpenStadiumMode={() => setShowStadiumMode(true)} isDark={isDark} />;
      case 'profile': return <ProfileTab isDark={isDark} />;
      default: return <HomeTab onOpenTicket={() => setShowTicketModal(true)} isDark={isDark} />;
    }
  };

  return (
    <div className={`min-h-screen font-sans flex justify-center transition-colors duration-300 ${isDark ? 'bg-[#020504]' : 'bg-gray-100'}`}>
      
      <div className={`w-full max-w-md relative shadow-2xl overflow-hidden flex flex-col h-screen transition-colors duration-300 ${isDark ? 'bg-[#0a150f]' : 'bg-gray-50'}`}>
        
        {}
        <header className={`px-6 pt-12 pb-6 flex items-center justify-between sticky top-0 backdrop-blur-xl z-30 border-b transition-colors duration-300 ${isDark ? 'bg-[#0a150f]/90 border-white/5' : 'bg-gray-50/90 border-gray-200'}`}>
          <div className="flex items-center gap-3">
             <div className={`w-10 h-10 rounded-full flex items-center justify-center p-1.5 shadow-sm transition-colors ${isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200'}`}>
                <EscudoNacional className="w-full h-full" />
             </div>
             <div>
               <p className={`text-[10px] font-medium transition-colors ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Olá, <span className={isDark ? "text-yellow-400 font-bold" : "text-yellow-600 font-bold"}>{userData.plan}</span></p>
               <h1 className={`text-sm font-bold transition-colors ${isDark ? 'text-white' : 'text-gray-900'}`}>{userData.name}</h1>
             </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsDark(!isDark)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isDark ? 'bg-white/5 border border-white/10 hover:bg-white/10' : 'bg-white border border-gray-200 shadow-sm hover:bg-gray-50'}`}
            >
              {isDark ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-blue-600" />}
            </button>
            <button className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all ${isDark ? 'bg-white/5 border border-white/10 hover:bg-white/10' : 'bg-white border border-gray-200 shadow-sm hover:bg-gray-50'}`}>
              <Bell size={18} className={isDark ? "text-gray-300" : "text-gray-600"} />
              <span className={`absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 rounded-full border ${isDark ? 'border-[#0a150f]' : 'border-white'}`}></span>
            </button>
          </div>
        </header>

        {}
        <main className="px-6 flex-1 overflow-y-auto scrollbar-hide pt-4">
          {renderTab()}
        </main>

        {}
        <nav className={`absolute bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-[calc(448px-3rem)] backdrop-blur-xl border rounded-full px-2 py-2 flex justify-between items-center z-40 transition-colors duration-300 ${isDark ? 'bg-[#050b08]/90 border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.8)]' : 'bg-white/90 border-gray-200 shadow-2xl'}`}>
          {[
            { id: 'home', icon: Home, label: 'Início' },
            { id: 'benefits', icon: Tags, label: 'Vantagens' },
            { id: 'card', icon: QrCode, label: 'Carteira', isCenter: true },
            { id: 'fanzone', icon: Gamepad2, label: 'Fan Zone' },
            { id: 'profile', icon: User, label: 'Perfil' }
          ].map((item) => (
             item.isCenter ? (
               <button key={item.id} onClick={() => setActiveTab(item.id)} className="relative group mx-2">
                 <div className="absolute inset-0 bg-emerald-500 rounded-full blur-md opacity-40 group-hover:opacity-80 transition-opacity"></div>
                 <div className={`w-14 h-14 rounded-full flex items-center justify-center relative z-10 border-2 transition-colors shadow-lg ${activeTab === item.id ? 'bg-gradient-to-br from-emerald-400 to-green-600 border-emerald-300 text-white' : 'bg-gradient-to-br from-emerald-600 to-green-800 border-emerald-500 text-white/80'}`}>
                   <item.icon size={26} strokeWidth={activeTab === item.id ? 2.5 : 2} />
                 </div>
               </button>
             ) : (
               <button key={item.id} onClick={() => setActiveTab(item.id)} className="flex-1 flex flex-col items-center gap-1.5 py-2 relative group">
                 {activeTab === item.id && <div className="absolute top-0 w-8 h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent rounded-b-full"></div>}
                 <item.icon size={20} className={`transition-colors ${activeTab === item.id ? 'text-emerald-500' : isDark ? 'text-gray-500 group-hover:text-gray-400' : 'text-gray-400 group-hover:text-gray-600'}`} />
                 <span className={`text-[9px] font-bold tracking-wider transition-colors ${activeTab === item.id ? 'text-emerald-500' : isDark ? 'text-gray-500 group-hover:text-gray-400' : 'text-gray-400 group-hover:text-gray-600'}`}>{item.label}</span>
               </button>
             )
          ))}
        </nav>

        {}
        {showTicketModal && (
          <div className="absolute inset-0 z-[100] flex items-end justify-center p-4 overflow-hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowTicketModal(false)}></div>
            <div className={`w-full border rounded-t-3xl sm:rounded-3xl p-6 relative z-10 animate-in slide-in-from-bottom-8 duration-300 shadow-2xl ${isDark ? 'bg-[#0a150f] border-white/10' : 'bg-white border-gray-200'}`}>
              <button onClick={() => setShowTicketModal(false)} className={`absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10' : 'bg-gray-100 text-gray-500 hover:text-gray-800 hover:bg-gray-200'}`}>
                 <X size={18} />
              </button>
              <h3 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Comprar Ingresso VIP</h3>
              <p className={`text-sm mb-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Nacional x Treze-PB • Sáb, 24 Out</p>
              
              <div className="space-y-3 mb-6">
                 {['Cadeiras Cativas - R$ 80,00', 'Arquibancada Sol - R$ 40,00', 'Arquibancada Sombra - R$ 60,00'].map((sector, i) => (
                    <button key={i} className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all group ${isDark ? 'border-white/10 bg-white/5 hover:bg-emerald-900/30 hover:border-emerald-500/50' : 'border-gray-200 bg-gray-50 hover:bg-emerald-50 hover:border-emerald-200'}`}>
                       <span className={`text-sm font-semibold transition-colors ${isDark ? 'text-gray-200 group-hover:text-emerald-400' : 'text-gray-700 group-hover:text-emerald-700'}`}>{sector}</span>
                       <ChevronRight size={18} className={`transition-colors ${isDark ? 'text-gray-600 group-hover:text-emerald-400' : 'text-gray-400 group-hover:text-emerald-600'}`} />
                    </button>
                 ))}
              </div>
              <button 
                onClick={() => {
                  setHasTicket(true);
                  setShowTicketModal(false);
                }} 
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-black rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-[1.02] transition-transform"
              >
                Emitir com Desconto Sócio
              </button>
            </div>
          </div>
        )}

        {showStadiumMode && (
          <div className={`absolute inset-0 z-[200] flex flex-col items-center justify-center transition-colors duration-100 ${stadiumColor}`}>
            <div className={`absolute top-12 left-0 w-full text-center p-4 transition-colors duration-100 ${stadiumColor === 'bg-white' ? 'text-emerald-600' : 'text-white'}`}>
              <Zap size={48} className={`mx-auto mb-4 animate-bounce ${stadiumColor === 'bg-white' ? 'text-emerald-500' : 'text-white'}`} />
              <h2 className="text-3xl font-black uppercase tracking-widest leading-none">Levante o<br/>Celular!</h2>
              <p className="mt-2 font-bold opacity-80 uppercase tracking-widest text-sm">O show vai começar</p>
            </div>
            <div className={`w-48 h-48 rounded-full flex items-center justify-center transition-colors duration-100 shadow-2xl p-4 ${stadiumColor === 'bg-white' ? 'bg-emerald-500' : 'bg-white'}`}>
               <EscudoNacional className="w-full h-full drop-shadow-2xl" />
            </div>
            <button 
              onClick={() => setShowStadiumMode(false)} 
              className={`absolute bottom-12 w-16 h-16 rounded-full flex items-center justify-center backdrop-blur-md shadow-2xl border-2 transition-colors duration-100 hover:scale-110 active:scale-95 ${stadiumColor === 'bg-white' ? 'bg-emerald-500 border-white text-white' : 'bg-white border-emerald-500 text-emerald-500'}`}
            >
               <X size={32} strokeWidth={3} />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}