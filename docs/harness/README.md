# Harness 文档

这里的 harness 指让人和编码 Agent 能够可靠理解、开发、验证和运行系统的项目上下文与约束，也包括运行时简历 Agent 的契约。不要将文档里的目标设计误认为已经实现。

正式开发先阅读 [技术架构设计](../architecture/technical-architecture.md)：统一 `.env`、pi-ai / pi-durable、D1 领域存储和 Durable Objects 恢复机制。

| 文档                               | 用途                                                  |
| ---------------------------------- | ----------------------------------------------------- |
| [architecture.md](architecture.md) | 当前组件/数据流、部署拓扑、目标 Agent 工具架构与决策  |
| [features.md](features.md)         | 页面行为、API、数据模型、失败与取消语义               |
| [standards.md](standards.md)       | 目录边界、组件约定、事实约束、安全与变更流程          |
| [operations.md](operations.md)     | 本地启动、OAuth/模型配置、D1 迁移、Workers 发布与排障 |
| [evaluation.md](evaluation.md)     | 已验证结果、测试矩阵、Agent 质量评估与生产门槛        |

根目录 [AGENTS.md](../../AGENTS.md) 是后续编码 Agent 的首读入口。产品目标与非目标见 [PRD](../product/PRD.md)。
