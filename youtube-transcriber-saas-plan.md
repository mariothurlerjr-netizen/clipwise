# 🚀 Plano SaaS — YouTube Transcriber

## A resposta curta: SIM, dá pra fazer!

Existem várias formas de transformar isso num produto que gera receita. Aqui vai um plano realista:

---

## Arquitetura do Produto

### Stack Sugerida

| Camada | Tecnologia | Custo Mensal |
|--------|-----------|-------------|
| **Frontend** | Next.js + Tailwind (Vercel) | $0-20 |
| **Backend/API** | FastAPI (Python) ou Next.js API Routes | $5-25 (Railway/Fly.io) |
| **Banco de Dados** | Supabase (PostgreSQL + Auth) | $0-25 |
| **Fila de Jobs** | Redis + Celery ou BullMQ | incluso no servidor |
| **AI (resumos)** | Claude API (Anthropic) | ~$0.003/vídeo curto |
| **Pagamentos** | Stripe | 2.9% + $0.30/transação |

**Custo total para começar: ~$10-50/mês**

### Fluxo do Usuário

```
Usuário cola link → Sistema extrai transcrição → Claude gera resumo
→ Resultado aparece no dashboard → Exporta PDF/TXT/Notion
```

---

## Modelos de Monetização

### Opção 1: Freemium + Assinatura (Recomendado)

| Plano | Preço | Inclui |
|-------|-------|--------|
| **Free** | $0 | 3 vídeos/mês, sem resumo AI |
| **Pro** | $9.90/mês | 50 vídeos/mês, resumo AI, export PDF |
| **Business** | $29.90/mês | Ilimitado, API access, monitoramento de canais, webhook |
| **Enterprise** | $99/mês | White-label, múltiplos usuários, integrações |

### Opção 2: Pay-per-use

| Tamanho do Vídeo | Preço |
|-------------------|-------|
| Até 10 min | $0.50 |
| 10-30 min | $1.00 |
| 30-60 min | $2.00 |
| 60+ min | $3.00 |

### Opção 3: Híbrido (melhor para começar)
- Plano gratuito limitado para aquisição
- Créditos pré-pagos ($5 = 10 vídeos)
- Assinatura mensal para heavy users

---

## Custo por Vídeo (sua margem)

| Componente | Custo por vídeo |
|-----------|----------------|
| Transcrição (YouTube API) | $0.00 (gratuito) |
| Resumo Claude (Sonnet) | ~$0.003-0.01 |
| Infraestrutura | ~$0.001 |
| **Total** | **~$0.005-0.01/vídeo** |

**Se cobra $1/vídeo = margem de ~99%**
**Se cobra $9.90/mês por 50 vídeos = custo de ~$0.50 = margem de ~95%**

---

## Features para Diferenciar

### Fase 1 (MVP — 2-4 semanas)
- [ ] Cola link → transcrição + resumo
- [ ] Dashboard com histórico
- [ ] Export TXT/PDF
- [ ] Login com Google/GitHub
- [ ] Stripe para pagamentos

### Fase 2 (Growth — 1-2 meses)
- [ ] Monitoramento automático de canais
- [ ] Notificações (email/Telegram/WhatsApp)
- [ ] API pública para desenvolvedores
- [ ] Integração com Notion
- [ ] Busca semântica nas transcrições
- [ ] Suporte a playlists inteiras

### Fase 3 (Escala)
- [ ] Chrome extension
- [ ] Multi-idioma com tradução automática
- [ ] Geração de clips/highlights
- [ ] Resumos personalizáveis (acadêmico, executivo, casual)
- [ ] White-label para empresas

---

## Concorrentes e Diferenciação

| Concorrente | Preço | Diferencial nosso |
|-------------|-------|--------------------|
| Otter.ai | $16.99/mês | Foco específico em YouTube, mais barato |
| Notta.ai | $13.99/mês | Resumos melhores com Claude |
| Tactiq | $12/mês | Monitoramento automático de canais |
| YouTube transcript (manual) | Grátis | Resumo AI + organização + monitoramento |

---

## Próximos Passos Práticos

1. **Hoje**: O script base já está pronto (feito!)
2. **Semana 1**: Criar landing page + API com FastAPI
3. **Semana 2**: Adicionar autenticação + Stripe
4. **Semana 3**: Dashboard com histórico
5. **Semana 4**: Launch no Product Hunt / Twitter

---

## Considerações Legais

- YouTube Terms of Service permitem acesso a legendas públicas
- Não armazenar conteúdo protegido por copyright longo prazo
- Termos de uso claros sobre fair use
- LGPD/GDPR para dados dos usuários
- Consultar um advogado antes de lançar comercialmente
