export default function HomePage() {
  return (
    <main style={{fontFamily:'sans-serif',maxWidth:'1200px',margin:'0 auto',padding:'20px'}}>
      <div style={{background:'#E3001B',padding:'20px',borderRadius:'10px',marginBottom:'20px'}}>
        <h1 style={{color:'white',fontFamily:'Impact',fontSize:'48px',margin:0}}>
          SPA<span style={{color:'#F5A623'}}>ZA</span>
        </h1>
        <p style={{color:'white',margin:'8px 0 0'}}>South Africa's Online Marketplace</p>
      </div>
      <div style={{background:'#0A1628',color:'white',padding:'20px',borderRadius:'10px',marginBottom:'20px'}}>
        <p style={{margin:0}}>🚀 Spaza is live! Operated by <strong>Eden Extract (Pty) Ltd</strong> | Reg: 2025/756709/07</p>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'16px'}}>
        {['Electronics','Fashion','Home & Garden','Sports','Books','Beauty'].map(cat => (
          <div key={cat} style={{background:'white',border:'2px solid #eee',borderRadius:'10px',padding:'20px',textAlign:'center'}}>
            <div style={{fontSize:'32px',marginBottom:'8px'}}>🛍️</div>
            <strong>{cat}</strong>
          </div>
        ))}
      </div>
    </main>
  )
}