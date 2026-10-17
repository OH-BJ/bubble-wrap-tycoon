# 뽁뽁이 타이쿤

책상 위에서 택배를 뜯고, 물건을 경매에 팔고, 뽁뽁이를 터뜨리는 타이쿤 게임. 기획은 [PLAN.md](PLAN.md).

**🎮 플레이: https://oh-bj.github.io/bubble-wrap-tycoon/** (PC 브라우저 권장)

`main` 브랜치에 올리면 테스트 → 빌드 → GitHub Pages 배포가 자동으로 진행된다.

## 실행
```
npm install      # 처음 한 번
npm run dev      # 개발 서버 → http://localhost:5173 에서 플레이
npm test         # 규칙 / 껐다 켜기 테스트
npm run build    # 배포용 파일 → dist/
```

## 개발용 팁
- 플레이는 `http://localhost:5173`, 테스트는 `http://127.0.0.1:5173` (세이브가 따로라서 서로 안 건드림)
- 주소 뒤에 `?reset` → 그 주소의 세이브 초기화
- 개발 서버에서는 콘솔에서 `__game.state` 로 상태 확인 가능
- 밸런스 시뮬레이션: `SIM=1 npx vitest run src/economy/sim.test.ts --silent=false`
- 가격 자동 조율: `SIM=tune TOTAL=125 npx vitest run src/economy/sim.test.ts --silent=false`
