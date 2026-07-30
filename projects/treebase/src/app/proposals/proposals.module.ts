import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProposalsRoutingModule } from './proposals-routing.module';
import { ProposalBackendService } from './proposal-backend.service';

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ProposalsRoutingModule
  ],
  providers: [
    ProposalBackendService
  ]
})
export class ProposalsModule { }
